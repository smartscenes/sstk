function Auth() {
}

Auth.prototype.authenticate = function(onSuccess) {
  var user = window.localStorage.getItem('stkuser');
  var prompt = true;
  try {
    user = JSON.parse(user);
    prompt = false;
  } catch (err) {
    console.warn('Error parsing stored username (JSON object expected)', user);
  }
  if (!prompt && user != null) {
    onSuccess(user);
  } else {
    bootbox.prompt({
      title: 'Please enter your username',
      inputType: 'text',
      value: user,
      callback: function (result) {
        if (result) {
          var user = { username: result };
          window.localStorage.setItem('stkuser', JSON.stringify(user));
          onSuccess(user);
        }
      }
    });
  }
};

Auth.prototype.addCheck = function(element) {
  var scope = this;
  var toCheck = element.find('[data-check-auth=true]');
  toCheck.each(function(index) {
    var el = $(this);
    el.off('click');
    el.click(function() {
      scope.authenticate(function(user) {
        if (el.attr('href')) {
          var url = el.attr('href');
          url = url.replace('[username]', user.username);
          var win = window.open(url, el.attr('target'));
          win.focus();
        }
      });
      return false;
    });
  });
};

module.exports = Auth;