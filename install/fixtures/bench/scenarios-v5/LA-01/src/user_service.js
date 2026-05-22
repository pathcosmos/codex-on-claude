function fetchUserProfile(userId, callback) {
  getUser(userId, function(err, user) {
    if (err) {
      getDefaultUser(function(err2, defaultUser) {
        fetchUserSettings(userId, function(err3, settings) {
          callback(err, defaultUser, settings);
        });
      });
    } else {
      fetchUserSettings(userId, function(err2, settings) {
        fetchUserPreferences(userId, function(err3, prefs) {
          callback(null, user, settings, prefs);
        });
      });
    }
  });
}