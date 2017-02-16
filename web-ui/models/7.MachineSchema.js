/**
 * Created by Thomas on 31/07/2016
 */
const mongoose = require('mongoose')
// const helper = require('pps-schema-helper')
const Schema = mongoose.Schema

const PackageSchema = new Schema({
  name: {type: String, required: true},
  command: {type: String, required: true}
})

/**
 * Sous-schemas à inclure
 */
// const BaseResourceSchema = helper.getBaseResourceSchema()
// const Resource = mongoose.model('Resource')
const MachineSchema = new Schema({
  is_template: {type: Boolean, default: false},
  name: {type: String, required: true},
  pathes: [String],
  machineType: {type: String, required: true},
  image: {type: String, required: true},
  gui: {type: Boolean, default: false},
  packages: [PackageSchema],
  commands: String
})

MachineSchema.methods.copy = function (body) {
  this.is_template = body.is_template
  this.name = body.name
  this.pathes = body.pathes
  this.machineType = body.machineType
  this.image = body.image
  this.packages = body.packages
  this.commands = body.commands
}

module.exports = mongoose.model('Machine', MachineSchema)
