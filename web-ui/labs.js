const express = require('express')
const path = require('path')
const app = express()

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.static(path.join(__dirname, '../node_modules')))
app.use(function (req, res, next) {
  next()
})

const index = require('./routes/index')
app.use('/', index)
const labs = require('./routes/labs')
app.use('/', labs)

module.exports = app
