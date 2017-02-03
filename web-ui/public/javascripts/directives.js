angular.module('adminModule')
.directive('elemDrop', ['$document', '$rootScope', function ($document, $rootScope) {
  return {
    restrict: 'A',
    scope: {
      elemDrop: '=',
      elemDropNetwork: '='
    },
    link: function (scope, element) {
      function mouseup (event) {
        event.preventDefault()
        var posX = event.clientX
        var posY = event.clientY
        var params = element[0].getBoundingClientRect()
        if ($rootScope.draggedElem &&
            posX >= params.left && posX <= params.right &&
            posY >= params.top && posY <= params.bottom) {
          scope.elemDrop(scope.elemDropNetwork, $rootScope.draggedElem)
        }
      }

      if (!scope.$parent.$parent.registerDrop) {
        var unreg = scope.$watch(function () {
          return !!scope.$parent.$parent.registerDrop
        }, function (val) {
          if (val === true) {
            scope.$parent.$parent.registerDrop(mouseup)
            unreg()
          }
        })
      } else {
        scope.$parent.$parent.registerDrop(mouseup)
      }
    }
  }
}])

.directive('elemDrag', ['$document', '$rootScope', function ($document, $rootScope) {
  return {
    scope: {
      elemDrag: '='
    },
    link: function (scope, element, attr) {
      var rawContent = scope.elemDrag

      if (!$rootScope.getRegisteredDrop) {
        $rootScope.dropsCb = []
        $rootScope.getRegisteredDrop = function () {
          return $rootScope.dropsCb
        }

        $rootScope.registerDrop = function (fn) {
          $rootScope.dropsCb.push(fn)
        }
      }

      var self = this
      var init = false
      scope.$watch('init.init', function (value) {
        if (value === true) {
          init = true
        }
      })

      var draggable = angular.element(document.querySelector('#dragElem'))

      function mousedown (event) {
        event.preventDefault()
        if (init === true) {
          return
        }
        if (!scope.init) {
          scope.init = {init: true}
        }
        scope.init.init = true
        scope.$apply()
        scope.init.init = false
        scope.$apply()
        self.draggedElem = false
        $rootScope.draggedElem = scope.elemDrag
        self.initX = event.pageX
        self.initY = event.pageY
      }

      element.on('mousedown', mousedown)

      function mousemove (event) {
        var posX = event.clientX
        var posY = event.clientY

        if (!init) {
          return
        }

        if (self.draggedElem !== true) {
          if (Math.abs(posX - self.initX) <= 10 && Math.abs(posY - self.initY) <= 10) {
            return
          }
          self.draggedElem = true

          $rootScope.draggedElem.dragged = true
          scope.$apply()
          self.draggedElement = rawContent
          draggable.addClass('dragging-element')
          draggable.text(self.draggedElement.name)
          draggable.removeClass('not-dragging-element')
          element.addClass('dragged-element')
        }

        draggable.css({
          top: event.pageY + 'px',
          left: event.pageX + 'px'
        })
      }

      $document.on('mousemove', mousemove)

      function mouseup (event) {
        var drops = $rootScope.getRegisteredDrop()
        for (var i in drops) {
          drops[i](event)
        }
        event.preventDefault()
        $rootScope.draggedElem = null
        self.draggedElem = false
        scope.$apply()
        init = false
        draggable.removeClass('dragging-element')
        draggable.addClass('not-dragging-element')
        element.removeClass('dragged-element')
      }

      $document.on('mouseup', mouseup)
    }
  }
}])
