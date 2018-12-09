/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */
var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var axios = require('axios');
var cookieParser = require('cookie-parser');
var core = require('./core');

var client_id = '1ff894dcd5b64c98b024d6125224bdc6'; // Your client id
var client_secret = 'bffb8961a25b4353a66aa537f9d3220a'; // Your secret
var redirect_uri = 'https://smartbox-ufrj.herokuapp.com/callback'; // Your redirect uri


/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());


// Routes

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-library-read user-read-recently-played';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        core.collectAndProcessUserInfo(access_token)
          .then(() => {
            // we can also pass the token to the browser to make requests from there
            res.redirect('/#' +
              querystring.stringify({
                access_token: access_token,
                refresh_token: refresh_token
              }));
          })
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

// app.get('/refresh_token', function(req, res) {

//   // requesting access token from refresh token
//   var refresh_token = req.query.refresh_token;
//   var authOptions = {
//     url: 'https://accounts.spotify.com/api/token',
//     headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
//     form: {
//       grant_type: 'refresh_token',
//       refresh_token: refresh_token
//     },
//     json: true
//   };

//   request.post(authOptions, function(error, response, body) {
//     if (!error && response.statusCode === 200) {
//       var access_token = body.access_token;
//       res.send({
//         'access_token': access_token
//       });
//     }
//   });
// });

app.get('/getMySmartboxUsers', function(req, res){
  axios.get("https://api.spotify.com/v1/me", {
    headers: { 'Authorization': 'Bearer ' + req.query.access_token }
  })
  .then(function(response) {
    core.getMySmartboxUsers(req.query.access_token, response.data.id)
      .then((usuario) => {
        res.json(usuario)
      })
  })
  .catch((err) => {
    res.status(err.response.status).json(err.response.data.error);
  })
});

app.get('/getUser/:userId?', function(req, res){
  let endPoint = req.params.userId ? "https://api.spotify.com/v1/users/"+req.params.userId : "https://api.spotify.com/v1/me"
  axios.get(endPoint, {
    headers: { 'Authorization': 'Bearer ' + req.query.access_token }
  })
  .then(function(response) {
    core.getUserFromDB(req.query.access_token, response.data.id)
      .then((usuario) => {
        res.json(usuario)
      })
  })
  .catch((err) => {
    res.status(err.response.status).json(err.response.data.error);
  })
});

app.get('/collectAndProcessUserInfo', function(req, res){
  core.collectAndProcessUserInfo(req.query.access_token)
    .then((result) => {
      res.json(result)
    })
    .catch((err) => {
      res.status(err.response.status).json(err.response.data.error);
    })
});

app.get('/setSmartboxOpenStatus', function(req, res){
  core.setSmartboxOpenStatus(req.query.access_token, req.query.status == "true")
    .then((result) => {
      res.json(result)
    })
    .catch((err) => {
      res.status(err.response.status).json(err.response.data.error);
    })
});

app.get('/enterInSomeoneSmartbox', function(req, res){
  core.enterInSomeoneSmartbox(req.query.access_token, req.query.userID)
    .then((result) => {
      res.json(result)
    })
    .catch((err) => {
      res.status(err.response.status).json(err.response.data.error);
    })
});


var port = process.env.PORT || 8000;
console.log("Running on port: " + port)
app.listen(port);
