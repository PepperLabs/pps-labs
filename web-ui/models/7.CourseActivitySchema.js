/**
 * Created by Thomas on 31/07/2016
 */
const mongoose = require('mongoose')
const helper = require('pps-schema-helper')

/**
 * Sous-schemas à inclure
 */
const BaseActivitySchema = helper.getBaseActivitySchema()
const Resource = mongoose.model('Resource')

const CourseActivitySchema = new BaseActivitySchema({
  type: String,
  place: String,
  school: String,
  promo: String,
  group: String
})

CourseActivitySchema.virtual('lab').set(function (item) { this._lab = item })
  .get(function () { return this._lab })

module.exports = Resource.discriminator('CourseActivity', CourseActivitySchema)
