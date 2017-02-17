'use strict'
const debug = require('debug')('pps:terraform')
const builder = new (require('xml2js')).Builder({cdata: true})
const tf = require('./tf-vars.js')
const path = require('path')
const mkdirp = require('mkdirp')
const fs = require('fs')
const windowsPassword = require('./gce-windows-password')
const spawn = require('child_process').spawn
const exec = require('child_process').exec
const RSA = require('node-rsa')
const RSAKey = new RSA().generateKeyPair()
let RSAPEM = RSAKey.exportKey('pkcs1-private-pem')
let RSAPubKey
let RSAPEMmod = RSAPEM.replace(new RegExp(/\n/, 'g'), '\\n')
exec('bash -c \'echo -e "' + RSAPEMmod + '" | /usr/bin/ssh-keygen -yf /dev/stdin\'',
  function (err, stdout, stderr) {
    if (err) throw err
    let key = stdout.replace('\n', '')
    RSAPubKey = 'etudiant:' + key + ' etudiant@machine'
  }
)

const guacamoleInitTpl = fs.readFileSync(path.join(__dirname, '../scripts/guacamole-init-script.tpl.sh')).toString()
let currentZone = 0
let terraformAlreadyInUse = false

/**
  A priori ce qu'il semble manquer:
  - conversion de LabActivity vers Terraform

  **/

// const engine = 'gce'
// const credentials = fs.readFileSync('../' + engine + '-credentials.json')
class Terraform {
  constructor ({engine, credentials, project, lab, users, machines, networkPrefix}) {
    this.engine = engine
    this.credentials = credentials
    this.credentialsJSON = JSON.stringify(credentials)
    this.project = project
    this.lab = lab // + '-' + (new Date()).toISOString()
    this.formatName()
    this.users = users
    this.machines = machines
    this.networkPrefix = networkPrefix
    this.networkName = 'net-' + this.lab
    this.networkTfVar = tf.network[this.engine] + '.' + this.networkName
    this.netinitPath = path.join(__dirname, '../tf-tests/netinit')
    this.instancesParams = []
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
    this.genNetwork()
    this.genFirewall()
    // pour chaque utilisateur on génère:
    // * un sous-réseau,
    // * des règles firewall,
    // * des instances
    for (let i = 0; i < this.users.length; i++) {
      this.genSubnetwork(i)
      this.genFirewallRule(i)
      let params = []
      for (let j = 0; j < this.machines.length; j++) {
        params.push(this.genInstance(i, this.machines[j], j))
      }
      this.instancesParams.push(params)
    }

    return this.saveTfConf()
  }

  saveTfConf () {
    if (terraformAlreadyInUse === true) {
      return Promise.reject(new Error('Terraform already in use'))
    }
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

  apply (guacamole) {
    if (terraformAlreadyInUse === true) {
      return Promise.reject(new Error('Terraform already in use'))
    }
    debug('start terraform apply')
    terraformAlreadyInUse = true
    return new Promise((resolve, reject) => {
      let tries = 0
      let max = 5
      let launch = () => {
        let tf = spawn('terraform', ['apply'], {cwd: this.netinitPath})
        tf.stdout.on('data', (data) => {
          console.log(data.toString())
        })

        tf.stderr.on('data', (data) => {
          console.log(data.toString())
        })

        tf.on('exit', (code) => {
          if (code !== 0) {
            debug('new try', tries)
            tries++
            if (tries <= max) {
              return setTimeout(launch, 20000)
            }
            debug('reject')
            terraformAlreadyInUse = false
            return reject(new Error('terraform exited with code' + code.toString()))
          }
          terraformAlreadyInUse = false
          if (guacamole) {
            return resolve()
          }
          this.getWindowsPasswords()
          .then(() => {
            this.initGuacamole()
            // save conf to guac init script
            // gen guac instance
            // save
            debug('done initGuacamole')
            this.genGuacamoleInstance()
            return this.saveTfConf()
          })
          .then(() => {
            tries = 0
            return this.apply(true)
          })
          .then(() => {
            return resolve()
          })
        })
      }
      launch()
    })
  }

  destroy () {
    if (terraformAlreadyInUse === true) {
      return Promise.reject(new Error('Terraform already in use'))
    }
    debug('start terraform destroy')
    terraformAlreadyInUse = true
    return new Promise((resolve, reject) => {
      let tries = 0
      let max = 5
      let launch = () => {
        let tf = spawn('terraform', ['destroy', '-force'], {cwd: this.netinitPath})
        tf.stdout.on('data', (data) => {
          console.log(data.toString())
        })

        tf.stderr.on('data', (data) => {
          console.log(data.toString())
        })

        tf.on('exit', (code) => {
          if (code !== 0) {
            debug('new try', tries)
            tries++
            if (tries <= max) {
              return setTimeout(launch, 40000)
            }
            debug('reject')
            terraformAlreadyInUse = false
            return reject(new Error('terraform exited with code' + code.toString()))
          }
          terraformAlreadyInUse = false
          resolve()
        })
      }
      launch()
    })
  }

  getWindowsPassword (id, cpt, machine) {
    return windowsPassword({
      instance: machine.name,
      zone: machine.zone,
      project: this.project,
      user: 'etudiant',
      email: this.credentials.client_email,
      credentials: this.credentials,
      RSAKey
    })
    .then(({username, password}) => {
      machine.username = username
      machine.password = password
      debug('machine: ', machine)
    })
  }

  getWindowsPasswords () {
    debug('getWindowsPasswords')
    return new Promise((resolve, reject) => {
      let promises = []
      for (let i = 0; i < this.users.length; i++) {
        for (let j = 0; j < this.instancesParams[i].length; j++) {
          let machine = this.instancesParams[i][j]
          debug('machine.image', machine.image, i, j)
          if (machine.image.indexOf('windows') === -1) {
            continue
          }
          promises.push(this.getWindowsPassword(i, j, machine))
        }
      }
      if (promises.length) {
        return Promise.all(promises)
        .then(() => resolve())
      }
      return resolve(null)
    })
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
          credentials: this.credentialsJSON,
          project: this.project,
          region: tf.regions[this.engine][currentZone]
        }
      }
    }
  }

  genNetwork () {
    if (!this.mainProjectFile.resource) {
      this.mainProjectFile.resource = []
    }
    this.mainProjectFile.resource.push({
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

  genSubnetwork (id) {
    if (!this.mainProjectFile.resource) {
      this.mainProjectFile.resource = []
    }
    this.mainProjectFile.resource.push({
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

  genFirewall () {
    if (!this.mainProjectFile.resource) {
      this.mainProjectFile.resource = []
    }
    this.mainProjectFile.resource.push({
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

    this.mainProjectFile.resource.push({
      [tf.firewall[this.engine]]: {
        ['fw-http-' + this.lab]: {
          name: 'http-' + this.lab,
          network: '${' + this.networkTfVar + '.name}',
          allow: [
            {protocol: 'tcp', ports: ['80']}
          ],
          source_ranges: ['0.0.0.0/0'],
          target_tags: ['http-server']
        }
      }
    })
  }

  genFirewallRule (id) {
    if (!this.mainProjectFile.resource) {
      this.mainProjectFile.resource = []
    }
    let name = 'subnet-' + this.lab + '-' + id
    this.mainProjectFile.resource.push({
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

  genInstance (id, instance, cpt, guacamole) {
    debug('genInstance')
    if (!this.mainProjectFile.resource) {
      this.mainProjectFile.resource = []
    }

    debug('instance', instance)

    if (!instance.machineType) {
      throw new Error('no machine type')
    }
    if (!instance.image) {
      throw new Error('no image name')
    }

    let metadataFlag = 'startup-script'
    if (instance.image.indexOf('windows') !== -1) {
      metadataFlag = 'windows-startup-script-ps1'
    }

    let script = ''
    if (instance.packages) {
      for (let i = 0; i < instance.packages.length; i++) {
        script += instance.packages[i].command + '\n'
      }
    }
    if (instance.commands) {
      script += instance.commands + '\n'
    }

    let machineName = 'eleve-' + this.lab + '-' + id + '-' + cpt
    if (guacamole) {
      machineName = 'guac-' + this.lab + '-' + id + '-' + cpt
    }
    debug('machine type', instance.machineType, tf.cores[this.engine][instance.machineType])

    let machine = {
      ip: this.getIp(id, cpt),
      name: machineName,
      machineType: tf.cores[this.engine][instance.machineType],
      image: tf.images[this.engine][instance.image],
      zone: tf.zones[this.engine][currentZone]
    }

    let conf = {
      name: machineName,
      machine_type: machine.machineType,
      zone: machine.zone,
      tags: ['subnet-' + this.lab + '-' + id],
      disk: {
        image: machine.image
      },
      network_interface: {
        subnetwork: this.getSubnetworkName(id),
        address: this.getIp(id, cpt),
        access_config: {}
      },
      metadata: {
        [metadataFlag]: script,
        'ssh-keys': RSAPubKey + '\ncherel.louis:ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDgX6F/AAm4ng+Z3riyq6CwsTs0lmr8WqD/Nj9rHJK2e93P5h8bPhOQgrcvi6Xp0KI86fpCXCQoSCTqU9moWcp90W0nxHPwix75L7vGQmgjEmtjdaNCyEHDCvVyKm54ghWsAd9WoXFJEaEcEAwQ8HVdvpqL7ZErCDRtdPpOnK+sdFtSnu3zTqfg3LQYHDsEyQ5KCgUtMOnWmf+5Lp3ThvE9B1bMV2NUZDzmqyxKL1KV7Mze9dMT17tS9IZhzBqFXbhdf59arUf6m24pzsx3IV4ZJMcgpvT7sx2QEIfKwV8XhueODJc3Fy9S6M5DBo7iWbo8/bwPjPME426loJvnCBBL cherel.louis@gmail.com'
      },
      service_account: {
        scopes: ['userinfo-email', 'compute-ro', 'storage-ro']
      }
    }

    if (guacamole === true) {
      conf.tags.push('http-server')
      // conf.tags.push('https-server')
      conf.tags.push('guacamole')
    }
    this.mainProjectFile.resource.push({
      [tf.instance[this.engine]]: {
        [machineName]: conf
      }
    })

    this.addMachine()
    return machine
  }

  genGuacamoleInstance () {
    let script = guacamoleInitTpl
    debug('script', script)
    script = script.replace('{{{GUAC_IP}}}', this.getIp(0, 250))
    script = script.replace('{{{USER_MAPPING}}}', this.guacUserMappingContent)

    let instance = {
      image: 'ubuntu-16.10',
      machineType: 'small',
      commands: script
    }

    this.genInstance(0, instance, 250, true)
  }

  initGuacamole () {
    debug('initGuacamole')
    // et ensuite seulement on instancie le guacamole
    // on génère le fichier guacamole user-mapping.xml
    let guacUserMapping = this.genGuacamoleUserMapping()
    // à la fin, on configure le guac avec tous nos paramètres
    for (let i = 0; i < this.instancesParams.length; i++) {
      this.genGuacamoleAuthorize(guacUserMapping, i, this.users[i], this.instancesParams[i])
    }

    // on génère la conf du guac pour se connecter aux machines
    this.guacUserMappingContent = this.genXml(guacUserMapping)
    debug('mapping content', this.guacUserMappingContent)
  }

  genGuacamoleConnection (protocol, name, inst) {
    debug('genGuacamoleConnection')
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
      conn.param.push({'_': inst.password, '$': {name: 'password'}})
//       conn.param.push({'_': '<![CDATA[' + inst.password + ']]>', '$': {name: 'password'}})
      conn.param.push({'_': 'nla', '$': {name: 'security'}})
      conn.param.push({'_': 'true', '$': {name: 'ignore-cert'}})
      conn.param.push({'_': 'true', '$': {name: 'enable-drive'}})
      conn.param.push({'_': 'true', '$': {name: 'create-drive-path'}})
      conn.param.push({'_': '/tmp/guac_' + name, '$': {name: 'drive-path'}})
    } else if (protocol === 'ssh') {
      conn.param.push({'_': 'etudiant', '$': {name: 'username'}})
      conn.param.push({'_': RSAPEM, '$': {name: 'private-key'}})
    } else if (protocol === 'vnc') {
      conn.param.push({'_': inst.password, '$': {name: 'password'}})
    }
    return conn
  }

  genGuacamoleAuthorize (content, id, user, params) {
    debug('genGuacamoleAuthorize')
    let authorize = {
      '$': {
        'username': user.email,
        'password': '1234567890'
      },
      connection: []
    }

    for (let j = 0; j < this.machines.length; j++) {
      let name = id + '-' + j
      let inst = this.machines[j]
      debug('inst.image', inst.image, j)
      if (inst.image.indexOf('windows') !== -1) {
        authorize.connection.push(this.genGuacamoleConnection('rdp', name, params[j]))
      } else {
        if (inst.gui) {
          authorize.connection.push(this.genGuacamoleConnection('vnc', name, params[j]))
        }
        authorize.connection.push(this.genGuacamoleConnection('ssh', name, params[j]))
      }
    }
    content['user-mapping']['authorize'].push(authorize)
  }

  genGuacamoleUserMapping () {
    return {'user-mapping': {authorize: []}}
  }

  genXml (content) {
    debug('genXml')
    /*
    debug(content['user-mapping']['authorize'])
    debug(content['user-mapping']['authorize'][0]['connection'])
    let params = content['user-mapping']['authorize'][0]['connection'][0]['param']
    for (let i = 0; i < params.length; i++) {
      debug(params[i])
    }
    */
    return builder.buildObject(content)
  }

}

module.exports = Terraform
