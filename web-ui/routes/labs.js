'use strict'
const router = require('express').Router()
const utils = require('pps-utils')
const mongoose = require('mongoose')
const Course = mongoose.model('CourseActivity')
const Group = mongoose.model('Group')
const LabActivity = mongoose.model('LabActivity')
const Machine = mongoose.model('Machine')
const debug = require('debug')('pps:labs-route')

router.get('/event', utils.hasToBeConnected, getEvents)
router.put('/event', utils.hasToBeConnected, editEvent)
router.get('/template/lab', utils.hasToBeConnected, getLabsTemplates)
router.get('/template/machine', utils.hasToBeConnected, getMachinesTemplates)
router.post('/template/machine', utils.hasToBeConnected, newMachineTemplate)
router.put('/template/machine', utils.hasToBeConnected, editMachineTemplate)

// const COURSE_STUDENT = 'COURSE_STUDENT'
const COURSE_TEACHER = 'COURSE_TEACHER'

function getEvents (req, res, next) {
  let _groups
  let _labsIds = []
  let _labsIdsRef = {}
  let _courses
  let eventIds = []
  req.user.fillExternalElements()
  .then(() => {
    let ids = []
    for (let i = 0; i < req.user.external_memberships.length; i++) {
      if (!utils.isActive(req.user.external_memberships[i].activation_dates)) {
        continue
      }
      ids.push(req.user.external_memberships[i]._resource)
    }

    return Group.find_({'_id': {'$in': ids}})
  })
  .then((groups) => {
    let fill = []
    _groups = groups
    for (let i = 0; i < groups.length; i++) {
      console.log(groups[i])
      fill.push(groups[i].fillExternalElements())
    }

    return Promise.all(fill)
  })
  .then(() => {
    for (let i = 0; i < _groups.length; i++) {
      for (let j = 0; j < _groups[i].external_relations.length; j++) {
        if (!utils.isActive(_groups[i].external_relations[j])) continue

        if (_groups[i].external_relations[j].name === COURSE_TEACHER) {
          eventIds.push(_groups[i].external_relations[j]._resource)
        }
      }
    }
    return Course.find_({'_id': {'$in': eventIds}})
  })
  .then((courses) => {
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].members.length > 0) {
        _labsIds.push(courses[i].members[0]._resource)
        _labsIdsRef[courses[i]._id.toString()] = courses[i].members[0]._resource.toString()
      }
    }
    _courses = courses
    return LabActivity.find_({'_id': {'$in': _labsIds}})
  })
  .then((labs) => {
    res.json(courses)
  })
  .catch(next)
}

function editEvent (req, res, next) {
  // TODO: security
  // let _course
  // Course.isRelatedTo(req.user, req.body._id)
  Course.findById_(req.body._id)
  .then((course) => {
    if (course.members.length === 0) {
      // new lab
      let lab = new LabActivity(req.body.lab)

      lab.external_memberships.push({
        _resource: course._id
      })
      return lab.save()
    }

    // edit lab
    return LabActivity.findById_(course.members[0]._resource)
    .then((lab) => {
      lab.copy(req.body.lab)
      return lab.save()
    })
  })
  .catch(next)
}

function newMachineTemplate (req, res, next) {
  // TODO: secure this shit
  let machine = new Machine(req.body)
  machine.save()
  .then(() => res.json(machine))
  .catch(next)
}

function editMachineTemplate (req, res, next) {
  let _machine
  Machine.findById(req.body._id).exec()
  .then((machine) => {
    if (!machine) {
      let err = new Error('aucune machine trouvée')
      err.status = 404
      throw err
    }

    debug(req.body)
    machine.copy(req.body)
    debug(machine)
    _machine = machine
    return machine.save()
  })
  .then(() => {
    res.json(_machine)
  })
  .catch(next)
}

function getLabsTemplates (req, res, next) {
  res.send('yolo')
}

function getMachinesTemplates (req, res, next) {
  Machine.find({}).exec()
  .then((machines) => {
    res.json(machines)
  })
  .catch(next)
}
module.exports = router
