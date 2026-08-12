/* Compatibilidade para celulares/tablets com navegadores mais antigos. */
(function () {
  if (!window.requestAnimationFrame) window.requestAnimationFrame = function (callback) { return setTimeout(callback, 16); };

  if (window.Element && !Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  }

  if (window.Element && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        if (element.matches(selector)) return element;
        element = element.parentElement;
      }
      return null;
    };
  }

  if (!window.crypto) window.crypto = {};
  if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16);
      if (window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
      else for (var cursor = 0; cursor < bytes.length; cursor++) bytes[cursor] = Math.floor(Math.random() * 256);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      return Array.prototype.map.call(bytes, function (byte, index) {
        var value = ('0' + byte.toString(16)).slice(-2);
        return [4, 6, 8, 10].indexOf(index) >= 0 ? '-' + value : value;
      }).join('');
    };
  }
}());
