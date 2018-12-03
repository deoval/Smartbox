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

var client_id = '1ff894dcd5b64c98b024d6125224bdc6'; // Your client id
var client_secret = 'bffb8961a25b4353a66aa537f9d3220a'; // Your secret
var redirect_uri = 'https://smartbox-ufrj.herokuapp.com/callback'; // Your redirect uri

var firebaseAdmin = require('firebase-admin');
var firebaseServiceAccount = process.env.firebaseJsonSDK ? JSON.parse(Buffer.from(process.env.firebaseJsonSDK, 'base64')) : require('./smartbox-ufrj-development-firebase-adminsdk-4b3zs-250740e362.json');
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(firebaseServiceAccount),
  databaseURL: "https://smartbox-ufrj.firebaseio.com"
});
var db = firebaseAdmin.firestore();

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


// Helpers
Map.prototype.sort = function() {
  return new Map([...this.entries()].sort((a, b) => { return b[1] - a[1] }))
}

Map.prototype.obj = function() {
  let obj = {}
  for(let [key,val] of this.entries()){
      obj[key]= val;
  }
  return obj
}


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

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          // Salvando usuário no banco de dados
          db.collection('usuarios').doc(body.id)
            .set({
              email: body.email,
              id_spotify: body.id,
              nome: body.display_name,
              url_imagem: body.images[0] ? body.images[0].url : null
            }, {merge: true});
        });


        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));

      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/get_listened', function(req, res){
  // Pega as últimas 50 músicas escutadas
  axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
    headers: { 'Authorization': 'Bearer ' + req.query.access_token }
  }).then(function(response) {
    // Separando uma lista de ids dos artistas escutados
    let artistsIds = []
    response.data.items.forEach((item) => {
      let musica = item.track

      // Salva a musica no banco de dados
      db.collection('musicas').doc(musica.id)
        .set({
          id_spotify: musica.id,
          titulo: musica.name,
          artistas: musica.artists.map(artist => db.collection("artistas").doc(artist.id)),
          album: db.collection("albuns").doc(musica.album.id),
          duracao_ms: musica.duration_ms,
          explicito: musica.explicit,
          ids_externos: musica.external_ids,
          numero_disco: musica.disc_number,
          numero_faixa: musica.track_number,
          popularidade: musica.popularity,
          url_spotify: musica.href,
        });

      musica.artists.forEach((artist) => {
        artistsIds.push(artist.id)
      })
    })

    // Pega todos os artistas salvos no banco
    db.collection('artistas').get()
      .then((artistaDocs)=>{
        let allSavedArtists = []
        artistaDocs.forEach((artistaDoc)=>{
          allSavedArtists.push(artistaDoc.data())
        })

        // Adiciona o artista já salvo na lista de escutados e remove da lista de ids
        let artistsListened = []
        artistsIds = artistsIds.filter((artistId) => {
          for(let savedArtist of allSavedArtists) {
            if(artistId == savedArtist.id_spotify) {
              artistsListened.push(savedArtist)
              return false
            }
          }
          return true
        })

        // Separando os ids dos artistas em lotes de 50 para fazer as requisições do spotify
        var artistsIdsChunks = [], size = 50;
        while (artistsIds.length > 0)
            artistsIdsChunks.push(artistsIds.splice(0, size));

        // Faz as requisições de cada lote de ids de artistas
        let artistsPromises = []
        artistsIdsChunks.forEach((artistsIdsChunk) => {
          artistsPromises.push(
            axios.get('https://api.spotify.com/v1/artists?ids=' + artistsIdsChunk.join(","), {
              headers: { 'Authorization': 'Bearer ' + req.query.access_token }
            })
          )
        })

        // Processa todas requisições dos lotes, quando terminar
        axios.all(artistsPromises).then(function(results) {
          // Salva cada artista no banco e adiciona na lista de escutados
          results.forEach((response) => {
            response.data.artists.forEach((artist) => {
              let artistModel = {
                id_spotify: artist.id,
                nome: artist.name,
                generos: artist.genres,
                popularidade: artist.popularity,
                qtd_seguidores: artist.followers ? artist.followers.total : null,
                url_spotify: artist.href,
                url_imagem: artist.images[0] ? artist.images[0].url : null,
              }
              artistsListened.push(artistModel)
              db.collection('artistas').doc(artist.id).set(artistModel);
            })
          })

          // Prepara a lista de generos mais escutados
          let genresNotes = new Map()
          artistsListened.forEach((artist) => {
            artist.generos.forEach((genre) => {
              let genreNote = genresNotes.get(genre)
              if(!genreNote) {
                genreNote = 0
              }
              genresNotes.set(genre, genreNote + 1)
            })
          })

          // Ordena os generos mais escutados por nota, e envia
          genresNotes = genresNotes.sort()
          res.json(genresNotes.obj())
        })
      })
  });
});


var port = process.env.PORT || 8000;
console.log("Running on port: " + port)
app.listen(port);
