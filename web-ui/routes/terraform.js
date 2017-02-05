'use strict'
const router = require('express').Router()
const utils = require('pps-utils')
const mongoose = require('mongoose')
const Course = mongoose.model('CourseActivity')
const Group = mongoose.model('Group')
const LabActivity = mongoose.model('LabActivity')
const Machine = mongoose.model('Machine')
const debug = require('debug')('pps:labs')
const path = require('path')
const fs = require('fs')
const parseString = require('xml2js').parseString
const Builder = require('xml2js').Builder()
const builder = new Builder()
const tf = require('./tf-vars.js')

const engine = 'gce'
const credentials = fs.readFileSync('../' + engine + '-credentials.json')

function genProject (engine, credentials, project, region) {
  return {
    provider: {
      [tf.provider[engine]]: {credentials, project, region}
    }
  }
}

function genNetwork (conf, engine, project) {
  if (!conf.resource) {
    conf.resource = []
  }
  conf.resource.push({
    [tf.network[engine]]: {
      ['net' + project]: {
        name: 'net' + project,
        auto_create_subnetworks: 'false'
      }
    }
  })
}

function genSubnetwork (conf, engine, project, id, network, region) {
  if (!conf.resource) {
    conf.resource = []
  }
  conf.resource.push({
    [tf.subnetwork[engine]]: {
      ['subnet' + project + '-' + id]: {
        name: 'subnet' + project + '-' + id,
        ip_cidr_range: network + '.' + id + '.0/24',
        network: tf.subnetwork[engine] + '.net' + project + '.self_link',
        region: region
      }
    }
  })
}

function genFirewall (conf, engine, project) {
  if (!conf.resource) {
    conf.resource = []
  }
  conf.resource.push({
    [tf.firewall[engine]]: {
      ['firewall' + project]: {
        name: 'firewall' + project,
        network: 'net' + project,
        allow: [
          {protocol: 'icmp'},
          {protocol: 'tcp', ports: ['22']}
        ],
        source_ranges: ['74.125.73.0/24']
      }
    }
  })
}

function genFirewallRule (conf, engine, project, id, network) {
  if (!conf.resource) {
    conf.resource = []
  }
  conf.resource.push({
    [tf.firewall[engine]]: {
      ['default-allow-internal-subnet' + project + '-' + id]: {
        name: 'firewall' + project,
        network: 'net' + project,
        allow: [
          {protocol: 'icmp'},
          {protocol: 'tcp', ports: ['0-65535']},
          {protocol: 'udp', ports: ['0-65535']}
        ],
        source_ranges: [network + '.' + id + '.0/24'],
        target_tags: ['subnet' + network + '-' + id]
      }
    }
  })
}
const currentZone = 0

function genInstance (conf, engine, project, network, id, instance, cpt) {
  if (!conf.resource) {
    conf.resource = []
  }
  let metadataFlag = 'startup-script'
  if (instance.windows) {
    metadataFlag = 'windows-startup-script-ps1'
  }

  conf.resource.push({
    [tf.instance[engine]]: {
      ['eleve' + project + '-' + id + '-' + cpt]: {
        name: 'eleve' + project + '-' + id + '-' + cpt,
        machine_type: tf.cores[engine][instance.machine_type],
        zone: tf.zones[engine][currentZone],
        tags: ['subnet' + project + '-' + id],
        disk: {
          image: tf.images[engine][instance.image]
        },
        network_interface: {
          subnetwork: 'subnet' + project + '-' + id,
          address: network + '.' + id + '.' + cpt,
          access_config: {}
        },
        metadata: {
          [metadataFlag]: instance.script
        }
      }
    }
  })
}

function genUserMapping (users, instances, filename) {
  let content = {}

  content['user-mapping'] = {'authorize': []}

  for (let i = 0; i < users.length; i++) {
    let authorize = {
      '$': {
        'username': users[i].username,
        'password': users[i].password
      },
      connection: []
    }

    for (let j = 0; j < instances.length; j++) {
      let inst = instances[j]
      let connection = {
        '$': {'name': 'rdp_' + i + '_' + j},
        'protocol': [(inst.protocol)],
        'param': [
          {'_': (inst.serverLayout || 'fr-fr-azerty'), '$': {'name': 'server-layout'}},
          {'_': (inst.colorDepth || '16'), '$': {'name': 'color-depth'}}
        ]
      }
      if (inst.windows) {
        connection.param.push({'_': (inst.hostname || '@host'), '$': {'name': 'hostname'}})
        connection.param.push({'_': '3389', '$': {'name': 'port'}})
      } else if (inst.gui) {
        // ajouter 2 connexions si c'est du linux et que c'est vnc, sinon juste ssh
      }
      authorize.connection.push(connection)
    }
    content['user-mapping']['authorize'].push(authorize)
  }

  var xml = builder.buildObject(content)
  fs.writeFileSync(filename, xml)
}

function init (lab) {

}
