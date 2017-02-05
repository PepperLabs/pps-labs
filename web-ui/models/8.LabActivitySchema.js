const mongoose = require('mongoose')
const helper = require('pps-schema-helper')
const debug = require('debug')('pps:lab-activity-schema')
/**
 * Sous-schemas à inclure
 */
const BaseActivitySchema = helper.getBaseActivitySchema()
const Resource = mongoose.model('Resource')
const Machine = mongoose.model('Machine')

const NetworkSchema = new mongoose.Schema({
  machines: {type: [Machine.schema], validate: [(a) => a.length < 2, '{PATH} exceeds the limit of 2']}
})

const LabActivitySchema = new BaseActivitySchema({
  is_template: {type: Boolean, default: true},
  networks: {type: [NetworkSchema], validate: [(a) => a.length < 3, '{PATH} exceeds the limit of 3']}
})

LabActivitySchema.methods.copy = function (body) {
  mongoose.model('Activity').copy(this, body)
  this.is_template = body.is_template
  this.networks = body.networks
}

module.exports = Resource.discriminator('LabActivity', LabActivitySchema)
