'use strict'
const debug = require('debug')('pps:terraform')
const builder = new (require('xml2js')).Builder()
const tf = require('./tf-vars.js')
const path = require('path')
const mkdirp = require('mkdirp')
const fs = require('fs')
const exec = require('child_process').exec
let currentZone = 0

/**
  A priori ce qu'il semble manquer:
  - conversion de LabActivity vers Terraform

  **/

// const engine = 'gce'
// const credentials = fs.readFileSync('../' + engine + '-credentials.json')
class Terraform {
  constructor ({engine, credentials, project, lab, users, machines, networkPrefix}) {
    this.engine = engine
    this.credentials = JSON.stringify(credentials)
    this.project = project
    this.lab = lab
    this.formatName()
    this.users = users
    this.machines = machines
    this.networkPrefix = networkPrefix
    this.networkName = 'net-' + this.project + '-fake'
    this.networkTfVar = tf.network[this.engine] + '.' + this.networkName
    this.netinitPath = path.join(__dirname, '../tf-tests/netinit')
    this.instancesParams = []
    // this.userTfFiles = []
    this.mainProjectFile = null
  }

  formatName () {
    if (this.lab.length > 17) {
      this.lab = this.lab.slice(0, 17 - this.lab.length)
    }
    this.lab = this.lab.toLowerCase()
    this.lab = this.lab.replace(/[^0-9a-z-]/g, '-')
  }

  initLab () {
    // Marche à suivre:
    // on génère un couple clé privée/clé publique pour guacamole
    // on crée un fichier tf pour le lab
    this.mainProjectFile = this.genProject()
    // on lui adjoint le réseau auquel il sera affilié
    this.genNetwork(this.mainProjectFile)
    this.genFirewall(this.mainProjectFile)
    // pour chaque utilisateur on génère:
    // * un sous-réseau,
    // * des règles firewall,
    // * des instances
    for (let i = 0; i < this.users.length; i++) {
      this.genSubnetwork(this.mainProjectFile, i)
      this.genFirewallRule(this.mainProjectFile, i)
      let params = []
      for (let j = 0; j < this.machines.length; j++) {
        params.push(this.genInstance(this.mainProjectFile, i, this.machines[j], j))
      }
      this.instancesParams.push(params)
    }

    return this.saveTfConf()
  }

  saveTfConf () {
    return new Promise((resolve, reject) => {
      let filename = 'lab.tf.json'
      let projectFile = JSON.stringify(this.mainProjectFile, null, 2)
      mkdirp(this.netinitPath, (err) => {
        if (err) return reject(err)
        fs.writeFile(path.join(this.netinitPath, filename), projectFile, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }

  apply () {
    return new Promise((resolve, reject) => {
      exec('terraform apply', {cwd: this.netinitPath}, (err, stdout, stderr) => {
        if (err) return reject(err)
        console.log('apply stdout:', stdout)
        console.log('apply stderr:', stderr)
        resolve()
      })
    })
  }

  destroy () {
    return new Promise((resolve, reject) => {
      exec('terraform destroy -force', {cwd: this.netinitPath}, (err, stdout, stderr) => {
        if (err) return reject(err)
        console.log('destroy stdout:', stdout)
        console.log('destroy stderr:', stderr)
        resolve()
      })
    })
  }

  initGuacamole () {
    // et ensuite seulement on instancie le guacamole
    // on génère le fichier guacamole user-mapping.xml
    let guacUserMapping = this.genGuacamoleUserMapping()
    // à la fin, on configure le guac avec tous nos paramètres
    for (let i = 0; i < this.instancesParams.length; i++) {
      this.genGuacamoleAuthorize(guacUserMapping, i, this.users[i], this.instancesParams[i])
    }

    // on génère la conf du guac pour se connecter aux machines
    let guacUserMappingContent = this.genXml(guacUserMapping)

    return guacUserMappingContent
  }

  addMachine () {
    tf.affectedZones[this.engine][currentZone]++
    if (tf.affectedZones[this.engine][currentZone] >= tf.maxPerZone[this.engine]) {
      currentZone++
    }
  }

  genProject () {
    return {
      provider: {
        [tf.provider[this.engine]]: {
          credentials: this.credentials,
          project: this.project,
          region: tf.regions[this.engine][currentZone]
        }
      }
    }
  }

  genNetwork (conf) {
    if (!conf.resource) {
      conf.resource = []
    }
    conf.resource.push({
      [tf.network[this.engine]]: {
        [this.networkName]: {
          name: this.networkName,
          auto_create_subnetworks: 'false'
        }
      }
    })
  }

  getSubnetwork (id) {
    return this.networkPrefix + id + '.0/24'
  }

  getIp (subnetwork, machine) {
    return this.networkPrefix + subnetwork + '.' + (machine + 2)
  }

  getSubnetworkName (id) {
    return '${' + tf.subnetwork[this.engine] + '.subnet-' + this.lab + '-' + id + '.name}'
  }

  genSubnetwork (conf, id) {
    if (!conf.resource) {
      conf.resource = []
    }
    conf.resource.push({
      [tf.subnetwork[this.engine]]: {
        ['subnet-' + this.lab + '-' + id]: {
          name: 'subnet-' + this.lab + '-' + id,
          ip_cidr_range: this.getSubnetwork(id),
          network: '${' + this.networkTfVar + '.self_link}',
          region: tf.regions[this.engine][currentZone]
        }
      }
    })
  }

  genFirewall (conf) {
    if (!conf.resource) {
      conf.resource = []
    }
    conf.resource.push({
      [tf.firewall[this.engine]]: {
        ['fw-ssh-' + this.lab]: {
          name: 'fw-ssh-' + this.lab,
          network: '${' + this.networkTfVar + '.name}',
          allow: [
            {protocol: 'icmp'},
            {protocol: 'tcp', ports: ['22']}
          ],
          source_ranges: ['0.0.0.0/0']
        }
      }
    })
  }

  genFirewallRule (conf, id) {
    if (!conf.resource) {
      conf.resource = []
    }
    let name = 'subnet-' + this.lab + '-' + id
    conf.resource.push({
      [tf.firewall[this.engine]]: {
        ['fw-internal-' + name]: {
          name: 'fw-internal-' + name,
          network: '${' + this.networkTfVar + '.name}',
          allow: [
            {protocol: 'icmp'},
            {protocol: 'tcp', ports: ['0-65535']},
            {protocol: 'udp', ports: ['0-65535']}
          ],
          source_ranges: [this.getSubnetwork(id)],
          target_tags: [name]
        }
      }
    })
  }

  genInstance (conf, id, instance, cpt) {
    if (!conf.resource) {
      conf.resource = []
    }
    let metadataFlag = 'startup-script'
    if (instance.windows) {
      metadataFlag = 'windows-startup-script-ps1'
    }

    debug('instance', instance)

    if (!instance.machineType) {
      throw new Error('no machine type')
    }
    if (!instance.image) {
      throw new Error('no image name')
    }
    let script = ''
    if (!instance.commands && (!instance.packages || instance.packages.length <= 0)) {
      throw new Error('no script')
    }

    if (instance.packages) {
      for (let i = 0; i < instance.packages.length; i++) {
        script += instance.packages[i].command + '\n'
      }
    }

    script += instance.commands + '\n'

    let machineName = 'eleve-' + this.lab + '-' + id + '-' + cpt
    debug('machine type', instance.machineType, tf.cores[this.engine][instance.machineType])
    conf.resource.push({
      [tf.instance[this.engine]]: {
        [machineName]: {
          name: machineName,
          machine_type: tf.cores[this.engine][instance.machineType],
          zone: tf.zones[this.engine][currentZone],
          tags: ['subnet-' + this.lab + '-' + id],
          disk: {
            image: tf.images[this.engine][instance.image]
          },
          network_interface: {
            subnetwork: this.getSubnetworkName(id),
            address: this.getIp(id, cpt),
            access_config: {}
          },
          metadata: {
            [metadataFlag]: script
          },
          service_account: {
            scopes: ['userinfo-email', 'compute-ro', 'storage-ro']
          }
        }
      }
    })
    this.addMachine()
    return this.getIp(id, cpt)
  }

  genGuacamoleConnection (protocol, name, inst) {
    let conn = {
      '$': {name: protocol + '-' + name},
      protocol,
      param: [
        {'_': inst.ip, '$': {name: 'hostname'}},
        {'_': 'fr-fr-azerty', '$': {name: 'server-layout'}},
        {'_': '16', '$': {name: 'color-depth'}}
      ]
    }

    if (protocol === 'rdp') {
      conn.param.push({'_': inst.username, '$': {name: 'username'}})
      conn.param.push({'_': '<![CDATA[' + inst.password + ']]', '$': {name: 'password'}})
      conn.param.push({'_': 'nla', '$': {name: 'security'}})
      conn.param.push({'_': 'true', '$': {name: 'ignore-cert'}})
      conn.param.push({'_': 'true', '$': {name: 'enable-drive'}})
      conn.param.push({'_': 'true', '$': {name: 'create-drive-path'}})
      conn.param.push({'_': '/tmp/guac_' + name, '$': {name: 'drive-path'}})
    } else if (protocol === 'ssh') {
      conn.param.push({'_': inst.username, '$': {name: 'username'}})
      conn.param.push({'_': inst.privKey, '$': {name: 'private-key'}})
    } else if (protocol === 'vnc') {
      conn.param.push({'_': '<![CDATA[' + inst.password + ']]', '$': {name: 'password'}})
    }
    return conn
  }

  genGuacamoleAuthorize (content, id, user, params) {
    let authorize = {
      '$': {
        'username': user.email,
        'password': user.password
      },
      connection: []
    }

    for (let j = 0; j < this.machines.length; j++) {
      let name = id + '-' + j
      let inst = this.machines[j]
      if (inst.windows) {
        authorize.connection.push(this.genGuacamoleConnection('rdp', name, params[j]))
      } else if (inst.linux && inst.gui) {
        authorize.connection.push(this.genGuacamoleConnection('vnc', name, params[j]))
      }
      if (inst.linux) {
        authorize.connection.push(this.genGuacamoleConnection('ssh', name, params[j]))
      }
    }
    content['user-mapping']['authorize'].push(authorize)
  }

  genGuacamoleUserMapping () {
    return {'user-mapping': {authorize: []}}
  }

  genXml (content) {
    return builder.buildObject(content)
  }

}

module.exports = Terraform
