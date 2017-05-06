'use strict'
const router = require('express').Router()
const utils = require('pps-utils')
const mongoose = require('mongoose')
const Course = mongoose.model('CourseActivity')
const Group = mongoose.model('Group')
const User = mongoose.model('User')
const LabActivity = mongoose.model('LabActivity')
const Machine = mongoose.model('Machine')
const ObjectId = mongoose.Types.ObjectId
const Terraform = require('../libs/terraform')
const debug = require('debug')('pps:labs')
const globals = require('platform-globals')
const path = require('path')
const fs = require('fs')
const livingInstances = []

router.get('/event', utils.hasToBeConnected, getEvents)
router.put('/event', utils.hasToBeConnected, editEvent)
router.get('/template/lab', utils.hasToBeConnected, getLabsTemplates)
router.get('/template/machine', utils.hasToBeConnected, getMachinesTemplates)
router.post('/template/machine', utils.hasToBeConnected, newMachineTemplate)
router.put('/template/machine', utils.hasToBeConnected, editMachineTemplate)
router.get('/packages', utils.hasToBeConnected, getPackages)
router.post('/lab/start/:resourceId', function (req, res, next) {
  if (!ObjectId.isValid(req.params.resourceId)) {
    return next('route')
  }
  next()
}, utils.hasToBeConnected, startLab)

router.post('/lab/stop/:resourceId', function (req, res, next) {
  if (!ObjectId.isValid(req.params.resourceId)) {
    return next('route')
  }
  next()
}, utils.hasToBeConnected, stopLab)

const COURSE_STUDENT = 'COURSE_STUDENT'
const COURSE_TEACHER = 'COURSE_TEACHER'
const ROLE_GROUP_PROJECT_STUDENT = 'ROLE_GROUP_PROJECT_STUDENT'
const ROLE_GROUP_PROJECT_TEACHER = 'ROLE_GROUP_PROJECT_TEACHER'

function getPackages (req, res, next) {
  let packages = []
  let files = 0
  let windows = path.join(__dirname, '../scripts/install/windows-server')
  let linux = path.join(__dirname, '../scripts/install/linux')
  fs.readdir(windows, (err, filenames) => {
    if (err) {
      debug('error', err)
      return
    }
    files += filenames.length - 1
    filenames.forEach((filename) => {
      fs.readFile(path.join(windows, filename), 'utf-8', (err, content) => {
        if (err) {
          debug('error', err)
          return
        }
        files--
        packages.push({
          name: filename,
          command: content,
          type: 'windows'
        })
        if (files === 0) {
          res.json(packages)
        }
      })
    })
  })
  fs.readdir(linux, (err, filenames) => {
    if (err) {
      debug('error', err)
      return
    }
    files += filenames.length - 1
    filenames.forEach((filename) => {
      fs.readFile(path.join(linux, filename), 'utf-8', (err, content) => {
        if (err) {
          debug('error', err)
          return
        }
        files--
        packages.push({
          name: filename,
          command: content,
          type: 'linux'
        })
        if (files === 0) {
          res.json(packages)
        }
      })
    })
  })
}

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
    _groups = groups
    for (let i = 0; i < _groups.length; i++) {
      for (let j = 0; j < _groups[i].relations.length; j++) {
        if (!utils.isActive(_groups[i].relations[j])) continue

        if (_groups[i].relations[j].name === COURSE_TEACHER) {
          eventIds.push(_groups[i].relations[j]._resource)
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
    for (let i = 0; i < labs.length; i++) {
      for (let j = 0; j < _courses.length; j++) {
        if (_labsIdsRef[_courses[j]._id.toString()] === labs[i]._id.toString()) {
          _courses[j].lab = labs[i]
          for (let k = 0; k < livingInstances.length; k++) {
            if (utils.equalIds(livingInstances[k]._resource, labs[i]._id)) {
              _courses[j].lab.guacamoleIp = livingInstances[k].guacIp
            }
          }
        }
      }
    }
    res.json(_courses)
  })
  .catch(next)
}

function editEvent (req, res, next) {
  // TODO: security
  let _course, _lab
  debug('body', req.body.lab)
  debug('body', req.body.lab.networks)
  // Course.isRelatedTo(req.user, req.body._id)
  Course.findById_(req.body._id)
  .then((course) => {
    _course = course
    return course.fillExternalElements()
  })
  .then(() => {
    if (_course.members.length) {
      // edit lab
      return LabActivity.findById_(_course.members[0]._resource)
      .then((lab) => {
        lab.copy(req.body.lab)
        _lab = lab
        return lab.save()
      })
    }
    // new lab
    _lab = new LabActivity(req.body.lab)
    if (!_lab.external_memberships) {
      _lab.external_memberships = []
    }

    if (!_lab.external_relations) {
      _lab.external_relations = []
    }

    _lab.external_memberships.push({
      _resource: _course._id
    })

    for (let i = 0; i < _course.external_relations.length; i++) {
      if (_course.external_relations[i].name === COURSE_STUDENT &&
          utils.isActive(_course.external_relations[i])) {
        _lab.external_relations.push({
          name: ROLE_GROUP_PROJECT_STUDENT,
          _resource: _course.external_relations[i]._resource
        })
      } else if (_course.external_relations[i].name === COURSE_TEACHER &&
          utils.isActive(_course.external_relations[i])) {
        _lab.external_relations.push({
          name: ROLE_GROUP_PROJECT_TEACHER,
          _resource: _course.external_relations[i]._resource
        })
      }
    }

    return _lab.save()
  })
  .then(() => {
    _course.lab = _lab
    res.json(_course.sendSafe(req))
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

function stopLab (req, res, next) {
  let _lab, _tf
  LabActivity.findById_(req.params.resourceId)
  .then((lab) => {
    _lab = lab
    return lab.fillExternalElements()
  })
  .then(() => {
    let userIds = []
    for (let i = 0; i < _lab.external_relations.length; i++) {
      if (_lab.external_relations[i].name === ROLE_GROUP_PROJECT_STUDENT &&
        utils.isActive(_lab.external_relations[i])) {
        userIds.push(_lab.external_relations[i]._resource)
      }
    }
    return Group.find_({_id: {$in: userIds}}).exec()
  })
  .then((groups) => {
    let users = [{}, {}]
    _tf = new Terraform({
      engine: 'gce',
      credentials: globals.GCE.credentials,
      project: globals.GCE.project,
      lab: _lab.name,
      users: users,
      machines: _lab.networks[0].machines,
      networkPrefix: globals.GCE.network
    })
    for (let i = 0; i < livingInstances.length; i++) {
      if (utils.equalIds(livingInstances[i]._resource, req.params.resourceId)) {
        livingInstances.splice(i, 1)
      }
    }
    return res.send('OK')
  })
  .then(() => {
    return _tf.destroy()
  })
  .catch(next)
}

function startLab (req, res, next) {
  let _lab, _tf
  LabActivity.findById_(req.params.resourceId)
  .then((lab) => {
    _lab = lab
    return lab.fillExternalElements()
  })
  .then(() => {
    let groupIds = []
    for (let i = 0; i < _lab.external_relations.length; i++) {
      if (_lab.external_relations[i].name === ROLE_GROUP_PROJECT_STUDENT &&
        utils.isActive(_lab.external_relations[i])) {
        groupIds.push(_lab.external_relations[i]._resource)
      }
    }
    return Group.find_({_id: {$in: groupIds}}).exec()
  })
  .then((groups) => {
    let userIds = []
    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups[i].members.length; j++) {
        if (utils.isActive(groups[i].members[j].activation_dates)) {
          userIds.push(groups[i].members[j]._resource)
        }
      }
    }
    return User.find_({_id: {$in: userIds}}).exec()
  })
  .then((users) => {
    debug('users', users)
    // return res.send('OK')
    _tf = new Terraform({
      engine: 'gce',
      credentials: globals.GCE.credentials,
      project: globals.GCE.project,
      lab: _lab.name,
      users: users,
      machines: _lab.networks[0].machines,
      networkPrefix: globals.GCE.network
    })
    return Promise.resolve()
  })
  .then(() => {
    return res.send('OK')
  })
  .then(() => {
    return _tf.initLab()
  })
  .then(() => {
    return _tf.apply()
  })
  .then((guacIp) => {
    return livingInstances.push({guacIp: guacIp, _resource: req.params.resourceId})
  })
  .catch(next)
}

module.exports = router
