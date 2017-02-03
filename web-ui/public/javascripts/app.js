angular.module('uploadsApp', [
  'ui.router',
  'pascalprecht.translate',
  'ui.calendar',
  'ui.bootstrap',
  'userModule',
  'ngResource',
  'adminModule'
])

.config(['$translateProvider', 'translateCst', function ($translateProvider, translateCst) {
  $translateProvider.translations('fr', translateCst.value)
  $translateProvider.preferredLanguage('fr')
}])

.config(['$urlRouterProvider', function ($urlRouterProvider) {
  $urlRouterProvider.otherwise('/main/labs')
}])

.config(['$stateProvider',
  function ($stateProvider) {
    $stateProvider
    .state('main', {
      url: '/main',
      data: {
        title: 'Rendu de projets'
      },
      templateUrl: 'partials/vue-principale.html',
      controller: 'OverviewCtrl'
    })
    .state('main.labs', {
      url: '/labs',
      templateUrl: 'partials/labs.html',
      controller: 'LabsCtrl'
    })
    .state('main.edit', {
      url: '/edit/:eventId',
      templateUrl: 'partials/edit-event.html',
      controller: 'EditEventCtrl'
    })
  }])

.config(['$httpProvider', function ($httpProvider) {
  $httpProvider.interceptors.push('serviceInterceptor')
}])

.run(['$state', '$rootScope', 'User', 'userId', '$timeout', '$cacheFactory', '$location', '$window',
  function ($state, $rootScope, User, userId, $timeout, $cacheFactory, $location, $window) {
    $rootScope.mainPageRoute = '/main'
    var currentTimeout = false
    $rootScope.setInfo = function (type, message, duration) {
      $rootScope.info = message
      $rootScope.infoGood = type
      $rootScope.infoDuration = duration || 5000

      if (currentTimeout) $timeout.cancel(currentTimeout);
      (function (dur) {
        currentTimeout = $timeout(function () { $rootScope.info = false }, dur)
      })($rootScope.infoDuration)

      console.log('message: ', message, type, duration)
    }

    $rootScope.lock = function () {
      $rootScope.editLock = true
    }

    $rootScope.unlock = function () {
      $rootScope.editLock = false
    }

    $rootScope.$on('$stateChangeStart', function (evt, absNewUrl, absOldUrl) {
      if ($rootScope.editLock === true) {
        if (!window.confirm("Certains changements effectués n'ont pas été enregistrés. Êtes-vous sûr de vouloir quitter la page ?")) {
          evt.preventDefault()
          return
        } else {
          $rootScope.editLock = false
        }
      }
    })

    $rootScope.$on('$stateChangeSuccess', function (event, toState, toParams, fromState, fromParams) {
      $rootScope.title = toState.data.title
      $rootScope.user = User.get({param1: 'me'}, function (res) {
        $rootScope.loggedIn = true
      }, function () {
        $rootScope.loggedIn = false
        $rootScope.user = new User()
        $window.location.href = '/#/login?url=' + window.encodeURIComponent($location.absUrl())
      })
    })

    $rootScope.logout = function () {
      $rootScope.user.$logout(function () {
        $rootScope.loggedIn = false
        delete $rootScope.user
        $window.location.href = '/#/login?url=' + window.encodeURIComponent($location.absUrl())
        $rootScope.setInfo(true, 'Déconnexion réussie', 3000)
      })
    }
  }
])
