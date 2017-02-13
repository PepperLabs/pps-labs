'use strict'
// const utils = require('pps-utils')
// const mongoose = require('mongoose')
// const Course = mongoose.model('CourseActivity')
// const Group = mongoose.model('Group')
// const LabActivity = mongoose.model('LabActivity')
// const Machine = mongoose.model('Machine')
const debug = require('debug')('pps:terraform')
// const path = require('path')
const fs = require('fs')
// const parseString = require('xml2js').parseString
const Builder = require('xml2js').Builder()
const builder = new Builder()
const tf = require('./tf-vars.js')

let currentZone = 0

// const engine = 'gce'
// const credentials = fs.readFileSync('../' + engine + '-credentials.json')
class Terraform {
  constructor ({engine, credentials, project, lab, users, instances, networkPrefix}) {
    this.engine = engine
    this.credentials = credentials
    this.project = project
    this.lab = lab
    this.users = users
    this.instances = instances
    this.networkPrefix = networkPrefix
  }

  init () {
    // Marche à suivre:
    // on génère un couple clé privée/clé publique pour guacamole
    // on crée un fichier tf pour le lab
    let mainProjectFile = this.genProject()
    // on lui adjoint le réseau auquel il sera affilié
    this.genNetwork(mainProjectFile)
    // on crée un fichier tf pour le firewall
    let fwProjectFile = this.genProject()
    // on génère sa conf pour accéder en ssh au projet ... ?
    this.genFirewall(fwProjectFile)
    // on génère les fichiers tf étudiants
    let userFiles = []
    let machinesParams = []
    // on génère le fichier guacamole user-mapping.xml
    let guacUserMapping = this.genGuacamoleUserMapping(this.users, this.instances)
    // pour chaque utilisateur on génère:
    // * un sous-réseau,
    // * des règles firewall,
    // * des instances
    for (let i = 0; i < this.users.length; i++) {
      let userFile = this.genProject()
      this.genSubnetwork(mainProjectFile, i)
      this.genFirewallRule(fwProjectFile, i)
      let params = []
      for (let j = 0; j < this.instances.length; i++) {
        params.push(this.genInstance(userFile, i, this.instances[j], j))
      }
      this.genServiceAccountScope(userFile)
      userFiles.push(userFile)
      machinesParams.push(params)
    }

    // à la fin, on configure le guac avec tous nos paramètres
    for (let i = 0; i < this.machinesParams.length; i++) {
      this.genGuacamoleAuthorize(guacUserMapping, i, this.users[i], machinesParams[i])
    }

    // on génère la conf du guac pour se connecter aux machines
    let guacUserMappingContent = this.genXml(guacUserMapping)
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
          region: tf.zones[this.engine][currentZone]
        }
      }
    }
  }

  genNetwork (conf, project) {
    if (!conf.resource) {
      conf.resource = []
    }
    conf.resource.push({
      [tf.network[this.engine]]: {
        ['net' + project]: {
          name: 'net' + project,
          auto_create_subnetworks: 'false'
        }
      }
    })
  }

  getSubnetwork (id) {
    return this.networkPrefix + '.' + id + '.0/24'
  }

  getIp (subnetwork, machine) {
    return this.networkPrefix + '.' + subnetwork + '.' + machine
  }

  genSubnetwork (conf, id) {
    if (!conf.resource) {
      conf.resource = []
    }
    conf.resource.push({
      [tf.subnetwork[this.engine]]: {
        ['subnet' + this.lab + '-' + id]: {
          name: 'subnet' + this.lab + '-' + id,
          ip_cidr_range: this.getSubnetwork(id),
          network: tf.subnetwork[this.engine] + '.net' + this.lab + '.self_link',
          region: tf.zones[this.engine][currentZone]
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
        ['firewall' + this.lab]: {
          name: 'firewall' + this.lab,
          network: 'net' + this.lab,
          allow: [
            {protocol: 'icmp'},
            {protocol: 'tcp', ports: ['22']}
          ],
          source_ranges: ['0.0.0.0/8'] // À quoi sert ça ?
        }
      }
    })
  }

  genFirewallRule (conf, id) {
    if (!conf.resource) {
      conf.resource = []
    }
    let name = 'subnet' + this.lab + '-' + id
    conf.resource.push({
      [tf.firewall[this.engine]]: {
        ['default-allow-internal-' + name]: {
          name: 'default-allow-internal-' + name,
          network: 'net' + this.lab,
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

  genServiceAccountScope (conf) {
    conf.service_account = {
      scopes: ['userinfo-email', 'compute-ro', 'storage-ro']
    }
  }

  genInstance (conf, id, instance, cpt) {
    if (!conf.resource) {
      conf.resource = []
    }
    let metadataFlag = 'startup-script'
    if (instance.windows) {
      metadataFlag = 'windows-startup-script-ps1'
    }

    conf.resource.push({
      [tf.instance[this.engine]]: {
        ['eleve-' + this.lab + '-' + id + '-' + cpt]: {
          name: 'eleve-' + this.lab + '-' + id + '-' + cpt,
          machine_type: tf.cores[this.engine][instance.machine_type],
          zone: tf.zones[this.engine][currentZone],
          tags: ['subnet' + this.lab + '-' + id],
          disk: {
            image: tf.images[this.engine][instance.image]
          },
          network_interface: {
            subnetwork: 'subnet' + this.lab + '-' + id,
            address: this.getIp(id, cpt),
            access_config: {}
          },
          metadata: {
            [metadataFlag]: instance.script
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
        'username': user.username,
        'password': user.password
      },
      connection: []
    }

    for (let j = 0; j < this.instances.length; j++) {
      let name = id + '-' + j
      let inst = this.instances[j]
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

  genGuacamoleUserMapping (users, instances) {
    let content = {}

    content['user-mapping'] = {'authorize': []}

    return content
  }

  genXml (content) {
    return builder.buildObject(content)
  }

}

module.exports = Terraform
