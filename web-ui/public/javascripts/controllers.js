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
          url: '/labs/events'
        })
        .then(function (response) {
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
              end: actDate.date_remove
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

.controller('EditModelCtrl', ['$scope', '$rootScope', '$stateParams', '$uibModalInstance', '$http',
  function ($scope, $rootScope, $stateParams, $uibModalInstance, $http) {
    function newTpl () {
      return {
        name: '',
        pathes: [],
        machineType: 'ubuntu-16.10',
        packages: []
      }
    }

    $scope.pathError = ''
    $scope.pathes = []

    $scope.newPath = ''

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
        command: 'wget http://sublime.com/submime.tar.gz'
      },
      {
        name: 'Codeblocks',
        selected: false,
        command: 'apt-get -y install codeblocks'
      }
    ]

    function setPkgSelected (input, output) {
      for (var j = 0; j < output.length; j++) {
        output[j].selected = false
        for (var k = 0; k < input.length; k++) {
          if (output[j].name === input[k].name) {
            output[j].selected = true
          }
        }
      }
    }

    var templates = {}

    for (var i in $scope.$parent.templates) {
      templates[$scope.$parent.templates[i].name] = $scope.$parent.templates[i]
    }
    var modelname = ''
    if ($stateParams.modelname) {
      modelname = $stateParams.modelname
      if (Object.keys(templates).indexOf(modelname) === -1) {
        return
      }
      $scope.tpl = templates[modelname]
    } else {
      $scope.newModel = true
      $scope.edit = true
      if (!$scope.model) {
        $scope.tpl = newTpl()
      } else {
        $scope.tpl = $scope.model
        setPkgSelected($scope.packagesLinux, $scope.tpl.packages)
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

    $scope.addPath = function () {
      if (!$scope.newPath) {
        return
      }

      if ($scope.newPath[0] !== '/') {
        $scope.editError.push('Le chemin doit être absolu')
        return
      }
      if ($scope.newPath.match(/\/\.\./)) {
        $scope.editError.push("/.. n'est pas accepté")
        return
      }

      $scope.tpl.pathes.push($scope.newPath)

      $scope.newPath = ''
    }

    $scope.editResource = function (edit) {
      $scope.edit = edit
    }
    $scope.ok = function () {
      for (var i = 0; i < $scope.packagesLinux; i++) {
        if ($scope.packagesLinux[i].selected) {
          $scope.tpl.packages.push($scope.packagesLinux[i])
        }
      }
      $http({
        method: $scope.tpl._id ? 'PUT' : 'POST',
        url: '/labs/template/machine',
        data: $scope.tpl
      })
      .then((response) => {
        if (!$scope.model) {
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

.controller('EditEventCtrl', ['$scope', '$uibModal', '$http', '$stateParams',
  function ($scope, $uibModal, $http, $stateParams) {
    if ($stateParams.eventId) {
      $scope.getEvents()
      .then(function (events) {
        for (var i = 0; i < events.length; i++) {
          if (events[i]._id === $stateParams.eventId) {
            $scope.ev = events[i]
          }
        }
      })
    }
    $scope.networks = [[]]
    $scope.draggedElem = false
    $scope.addNetwork = function () {
      if ($scope.networks.length < 3) {
        $scope.networks.push([])
      }
    }

    $scope.notFinished = function () {
      return $scope.networks[0].length < 1
    }

    $scope.rmNetwork = function (index) {
      $scope.networks.splice(index, 1)
    }

    $scope.rmInstance = function (network, index) {
      network.splice(index, 1)
    }

    $scope.$watch('networkNbr', function (curr, old) {
      if (curr === old) {
        return
      }
      if (curr < old) {
        $scope.networks.splice(curr - 1, old - curr)
        return
      }
      if (curr > old) {
        for (var i = old; i < curr; i++) {
          $scope.networks.push([])
        }
      }
    })

    $scope.editInstanceModel = function (model) {
      $scope.model = model
      var editInstanceModal = $uibModal.open({
        animation: true,
        templateUrl: 'partials/edit-model.html',
        scope: $scope,
        size: 'md',
        controller: 'EditModelCtrl'
      })
      editInstanceModal.result.then(function () {
      })
    }

    $scope.ok = function () {
    }
    $scope.cancel = function () {
    }
  }
])

.controller('LabsCtrl', ['$scope', '$compile', 'uiCalendarConfig', '$uibModal', '$http', '$state',
  function ($scope, $compile, uiCalendarConfig, $uibModal, $http, $state) {
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
