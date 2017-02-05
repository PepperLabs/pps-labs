angular.module('app')
.controller('MainCtrl', ['$scope', '$rootScope', '$http', '$q',
  function ($scope, $rootScope, $http, $q) {
    $scope.templates = []
    $http({
      methods: 'GET',
      url: '/labs/template/machine'
    })
    .then(function (response) {
      $scope.templates = response.data
    })
    $scope.events = []
    $scope.getEvents = function () {
      return $q(function (resolve, reject) {
        $http({
          methods: 'GET',
          url: '/labs/event'
        })
        .then(function (response) {
          $scope.events.length = 0
          for (var i = 0; i < response.data.length; i++) {
            var d = response.data[i]
            var actDate = d.activation_dates[d.activation_dates.length - 1]
            $scope.events.push({
              _id: d._id,
              title: d.name,
              location: d.place,
              school: d.school,
              group: d.group,
              start: actDate.date_add,
              end: actDate.date_remove,
              lab: d.lab
            })
            resolve($scope.events)
          }
        }, function (response) {
          reject()
        })
      })
    }
  }
])

.controller('PackagesCtrl', ['$scope', '$rootScope', '$stateParams',
  function ($scope, $rootScope, $stateParams) {
    $scope.packagesLinux = [
      {
        name: 'Node.js',
        selected: false,
        command: 'curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash - && apt-get -y install nodejs build-essential'
      },
      {
        name: 'Eclipse IDE',
        selected: false,
        command: 'apt-get -y install eclipse'
      },
      {
        name: 'Sublime Text',
        selected: false,
        command: 'wget http://sublime.com/sublime.tar.gz'
      },
      {
        name: 'Codeblocks',
        selected: false,
        command: 'apt-get -y install codeblocks'
      }
    ]

    function setPkgSelected (output, input) {
      for (var j = 0; j < output.length; j++) {
        output[j].selected = false
        for (var k = 0; k < input.length; k++) {
          if (output[j].name === input[k].name) {
            console.log('modified', output[j].name)
            output[j].selected = true
          }
        }
      }
    }

    $scope.editPkgs = function () {
      $scope.tpl.packages = []
      for (var i = 0; i < $scope.packagesLinux.length; i++) {
        if ($scope.packagesLinux[i].selected) {
          $scope.tpl.packages.push({
            name: $scope.packagesLinux[i].name,
            command: $scope.packagesLinux[i].command
          })
        }
      }
    }

    if ($scope.model) {
      setPkgSelected($scope.packagesLinux, $scope.tpl.packages)
    }
  }
])

.controller('FilesCtrl', ['$scope', '$rootScope', '$stateParams',
  function ($scope, $rootScope, $stateParams) {
    $scope.isPathValid = function () {
      var index

      if (!$scope.newPath) {
        return false
      }

      if ((index = $scope.editError.indexOf('Vous avez déjà indiqué ce fichier')) === -1) {
        if ($scope.tpl.pathes.indexOf($scope.newPath) !== -1) {
          $scope.editError.push('Vous avez déjà indiqué ce fichier')
          return false
        }
      } else {
        $scope.editError.splice(index, 1)
      }

      if ((index = $scope.editError.indexOf('Le chemin doit être absolu')) === -1) {
        if ($scope.newPath[0] !== '/') {
          $scope.editError.push('Le chemin doit être absolu')
          return false
        }
      } else {
        $scope.editError.splice(index, 1)
      }

      if ((index = $scope.editError.indexOf("/.. n'est pas accepté")) === -1) {
        if ($scope.newPath.match(/\/\.\./)) {
          $scope.editError.push("/.. n'est pas accepté")
          return false
        }
      } else {
        $scope.editError.splice(index, 1)
      }
      return true
    }

    $scope.addPath = function () {
      $scope.tpl.pathes.push($scope.newPath)

      $scope.newPath = ''
    }

    $scope.removePath = function (index) {
      $scope.tpl.pathes.splice(index, 1)
    }
  }
])

.controller('EditModelCtrl', ['$scope', '$rootScope', '$stateParams', '$uibModalInstance', '$http',
  function ($scope, $rootScope, $stateParams, $uibModalInstance, $http) {
    $scope.editError = []
    $scope.pathes = []
    $scope.newPath = ''
    var templates = {}

    function newTpl () {
      return {
        is_template: true,
        name: '',
        pathes: [],
        machineType: 'ubuntu-16.10',
        packages: []
      }
    }

    for (var i in $scope.$parent.templates) {
      templates[$scope.$parent.templates[i].name] = $scope.$parent.templates[i]
    }

    if (!$scope.model) {
      $scope.tpl = newTpl()
    } else {
      $scope.tpl = $scope.model
    }

    $scope.editResource = function (edit) {
      $scope.edit = edit
    }

    $scope.ok = function () {
      $uibModalInstance.close()
    }

    $scope.saveTemplate = function () {
      var tpl = angular.copy($scope.tpl)

      tpl.is_template = true
      $http({
        method: $scope.tpl._id ? 'PUT' : 'POST',
        url: '/labs/template/machine',
        data: tpl
      })
      .then((response) => {
        if (!$scope.model || $scope.model.is_template === false) {
          $scope.$parent.templates.push(response.data)
        } else {
          for (var i = 0; i < $scope.$parent.templates.length; i++) {
            if ($scope.$parent.templates[i]._id === response.data._id) {
              $scope.$parent.templates[i] = response.data
            }
          }
        }
        $uibModalInstance.close()
      })
    }
    $scope.cancel = function () {
      $uibModalInstance.close()
    }
    $scope.canSaveEdit = function () {
      var templates = []
      for (var i in $scope.$parent.templates) {
        templates.push($scope.$parent.templates[i].name.toLowerCase())
      }

      return !!(typeof $scope.tpl.name === 'string' &&
          $scope.tpl.name !== '' &&
          $scope.tpl.machineType !== '' &&
          ($scope.model || templates.indexOf($scope.tpl.name.toLowerCase()) === -1))
    }
  }
])

.controller('EditEventCtrl', ['$scope', '$uibModal', '$http', '$stateParams', '$state',
  function ($scope, $uibModal, $http, $stateParams, $state) {
    $scope.maxNetworks = 1
    $scope.maxMachines = 1
    $scope.machinesCount = 0
    $scope.draggedElem = false

    function newLab (name) {
      return {
        name: name,
        is_template: false,
        networks: [{machines: []}]
      }
    }

    if ($stateParams.eventId) {
      $scope.getEvents()
      .then(function (events) {
        for (var i = 0; i < events.length; i++) {
          if (events[i]._id === $stateParams.eventId) {
            $scope.ev = events[i]
            break
          }
        }
        console.log('event', $scope.ev)
        if ($scope.ev && $scope.ev.lab) {
          $scope.lab = $scope.ev.lab
        } else {
          $scope.lab = newLab($scope.ev.title)
        }
        $scope.countMachines()
      })
    } else {
      $state.transitionTo('main.labs')
    }

    $scope.countMachines = function () {
      $scope.machinesCount = 0
      for (var i = 0; i < $scope.lab.networks.length; i++) {
        $scope.machinesCount += $scope.lab.networks[i].machines.length
      }
    }

    $scope.addInstance = function (network, instance) {
      if ($scope.machinesCount >= $scope.maxMachines) return
      var copy = angular.copy(instance)
      delete copy._id
      copy.is_template = false
      network.machines.push(copy)
      $scope.countMachines()
    }

    $scope.addNetwork = function () {
      if ($scope.lab.networks.length < 3) {
        $scope.lab.networks.push({machines: []})
      }
    }

    $scope.notFinished = function () {
      return !$scope.lab || $scope.lab.networks[0].machines.length < 1
    }

    $scope.rmNetwork = function (index) {
      $scope.lab.networks.splice(index, 1)
      $scope.countMachines()
    }

    $scope.rmInstance = function (network, index) {
      network.machines.splice(index, 1)
      $scope.countMachines()
    }

    $scope.editInstanceModel = function (model, standalone) {
      $scope.model = model
      $scope.standalone = standalone
      var editInstanceModal = $uibModal.open({
        animation: true,
        templateUrl: 'partials/edit-model.html',
        scope: $scope,
        size: 'lg',
        controller: 'EditModelCtrl'
      })
      editInstanceModal.result.then(function () {
      })
    }

    $scope.saveTemplate = function () {
      console.log('test')
    }

    $scope.ok = function () {
      $scope.ev.lab = $scope.lab
      console.log($scope.ev)

      $http({
        method: 'PUT',
        url: '/labs/event',
        data: $scope.ev
      })
      .then(function (response) {
        $scope.ev = response.data
      })
    }
    $scope.cancel = function () {
      $state.transitionTo('main.labs')
    }
  }
])

.controller('CalendarCtrl', ['$scope', '$compile', 'uiCalendarConfig', '$uibModal', '$http', '$state',
  function ($scope, $compile, uiCalendarConfig, $uibModal, $http, $state) {
    $scope.$parent.view = 'calendar'
    /* alert on eventClick */
    $scope.eventClick = function (ev, jsEvent, view) {
      $state.transitionTo('edit', {eventId: ev._id})
    }

     /* Render Tooltip */
    $scope.eventRender = function (event, element, view) {
      element.attr({'tooltip': event.title,
        'tooltip-append-to-body': true})
      var eventTitle = element.find('.fc-title')
      eventTitle.append('<br/>' + event.group + ', ' + event.location)
      $compile(element)($scope)
    }

    /* config object */
    $scope.uiConfig = {
      calendar: {
        height: 450,
        editable: false,
        header: {
          right: 'agendaDay agendaWeek month',
          center: 'title',
          left: 'prev,next today'
        },
        firstDay: 1,
        dayNames: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
        dayNamesShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'vend.', 'sam.'],
        monthNames: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'Novembre', 'Décembre'],
        monthNamesShort: ['janv.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'],
        titleFormat: 'D MMM YYYY',
        defaultView: 'agendaWeek',
        timeFormat: 'H(:mm)',
        eventClick: $scope.eventClick,
        eventDrop: $scope.alertOnDrop,
        eventResize: $scope.alertOnResize,
        eventRender: $scope.eventRender
      }
    }

    var events = []
    $scope.eventSources = [events]
    /* event sources array */
    $scope.getEvents()
    .then(function (_events) {
      events.length = 0
      for (var i = 0; i < _events.length; i++) {
        events.push(_events[i])
      }
    })
  }
])
