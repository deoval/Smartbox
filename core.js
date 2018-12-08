
var axios = require('axios')

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


core = {}
  
/*
 *  Pega o Usuário de uma id salvo no banco, e filtra sua lista de gêneros
 *  escutados para apenas os gêneros aceitos pela busca do spotify 
 */
core.getUserFromDB = (access_token, id) => {
  return new Promise((resolve, reject) => {
    db.collection('usuarios').doc(id).get()
      .then((usuarioDoc) => {
        let usuario = usuarioDoc.data()

        // Pega a lista de gêneros usados pelo spotify e filtra a lista de gêneros escutados do usuário
        axios.get('https://api.spotify.com/v1/recommendations/available-genre-seeds', {
          headers: { 'Authorization': 'Bearer ' + access_token }
        }).then(function(response) {
          let spotifyGenres = response.data.genres
          for(let genero_escutado in usuario.generos_escutados) {
            if(!spotifyGenres.includes(genero_escutado)) {
              delete usuario.generos_escutados[genero_escutado]
            }
          }
          resolve(usuario)
        })
      })
      .catch((err) => {
        reject(err)
      })
  })
},

/*
 *  Pega o Usuário de uma id salvo no banco, e filtra sua lista de gêneros
 *  escutados para apenas os gêneros aceitos pela busca do spotify 
 */
core.getMySmartboxUsers = (access_token, id) => {
  return new Promise((resolve, reject) => {
    db.collection('usuarios').doc(id).collection("smartbox_usuarios").get()
      .then((smartboxUsuariosDoc) => {

        db.collection('usuarios').doc(id).get()
          .then((usuarioDoc) => {
            let usuarioSmartbox = {
              usuario: usuarioDoc.data(),
              permitido: true,
              host: true
            }

            let smartboxUsuarios = [usuarioSmartbox]
            smartboxUsuariosDoc.forEach((smartboxUsuarioDoc) => {
              smartboxUsuarios.push(smartboxUsuarioDoc.data())
            })

            // Pega a lista de gêneros usados pelo spotify e filtra a lista de gêneros escutados do usuário
            axios.get('https://api.spotify.com/v1/recommendations/available-genre-seeds', {
              headers: { 'Authorization': 'Bearer ' + access_token }
            }).then(function(response) {
              let spotifyGenres = response.data.genres

              smartboxUsuarios = smartboxUsuarios.map((smartboxUsuario) => {
                let totalNote = 0
                for(let genero_escutado in smartboxUsuario.usuario.generos_escutados) {
                  if(!spotifyGenres.includes(genero_escutado)) {
                    delete smartboxUsuario.usuario.generos_escutados[genero_escutado]
                  } else {
                    totalNote += smartboxUsuario.usuario.generos_escutados[genero_escutado]
                  }
                }

                smartboxUsuario.distribuicao = {}
                for(let genero_escutado in smartboxUsuario.usuario.generos_escutados) {
                  let percentualGenreNote = smartboxUsuario.usuario.generos_escutados[genero_escutado] / totalNote
                  smartboxUsuario.distribuicao[genero_escutado] = percentualGenreNote
                }
                return smartboxUsuario
              })
              
              resolve(smartboxUsuarios)
            })
          })
      })
      .catch((err) => {
        reject(err)
      })
  })
},
  
/*
 *  Prepara a coleta de dados sobre os gostos do usuário
 */
core.collectAndProcessUserInfo = (access_token) => {
  return new Promise((resolve, reject) => {
    // Pega o usuário atual no spotify
    axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': 'Bearer ' + access_token }
    }).then(function(response) {

      let usuario = response.data

      // Salvando usuário no banco de dados
      db.collection('usuarios').doc(usuario.id)
        .set({
          email: usuario.email,
          id_spotify: usuario.id,
          nome: usuario.display_name,
          url_imagem: usuario.images[0] ? usuario.images[0].url : null,
          url_spotify: usuario.external_urls.spotify,
        }, {merge: true});

      // Pega todas as músicas escutadas pelo usuário atual salvo no banco
      db.collection('usuarios').doc(usuario.id).collection('musicas_tocadas').get()
        .then((musicasTocadasDocs) => {

          // Monta a lista de músicas tocadas salvas no usuário
          let musicasTocadas = []
          musicasTocadasDocs.forEach((musicaTocadaDoc) => {
            musicasTocadas.push(musicaTocadaDoc.data())
          })

          // Pega as últimas 50 músicas escutadas no spotify
          axios.get('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
            headers: { 'Authorization': 'Bearer ' + access_token }
          }).then(function(response) {

            // Separa uma lista de ids dos artistas escutados
            let artistsIds = []
            for(let musicaTocada of musicasTocadas) {
              musicaTocada.artistas.forEach((artista) => {
                artistsIds.push(artista.id)
              })
            }
            
            let newListenedList = response.data.items.filter((item) => {
                for(let musicaTocada of musicasTocadas) {
                  if(item.track.id+item.played_at == musicaTocada.musica.id+musicaTocada.tocada_em) {
                    return false
                  }
                }
                return true
              })
            
            newListenedList.forEach((item) => {
              let musica = item.track

              // Adiciona os novos ids de artistas escutados na lista
              musica.artists.forEach((artist) => {
                artistsIds.push(artist.id)
              })

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
                  url_spotify: musica.external_urls.spotify,
                });

              // Salva o album no banco de dados
              db.collection('albuns').doc(musica.album.id)
                .set({
                  id_spotify: musica.album.id,
                  titulo: musica.album.name,
                  artistas: musica.album.artists.map(artist => db.collection("artistas").doc(artist.id)),
                  url_spotify: musica.album.external_urls.spotify,
                  url_imagem: musica.album.images[0] ? musica.album.images[0].url : null,
                });

              // Salva a música tocada na lista do usuário
              db.collection('usuarios').doc(usuario.id).collection('musicas_tocadas').doc(musica.id+item.played_at)
                .set({
                  artistas: musica.artists.map(artist => db.collection("artistas").doc(artist.id)),
                  musica: db.collection("musicas").doc(musica.id),
                  tocada_em: item.played_at
                })
            })

            // Pega todos os artistas salvos no banco
            db.collection('artistas').get()
              .then((artistaDocs) => {
                let allSavedArtists = []
                artistaDocs.forEach((artistaDoc) => {
                  allSavedArtists.push(artistaDoc.data())
                })

                // Adiciona os artista salvos escutados na lista de escutados
                // e remove o seu id da lista de ids a serem buscados
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

                // Separa os ids dos artistas em lotes de 50 para fazer as requisições do spotify
                var artistsIdsChunks = [], size = 50;
                while (artistsIds.length > 0)
                    artistsIdsChunks.push(artistsIds.splice(0, size));

                // Faz as requisições de cada lote de ids de artistas
                let artistsPromises = []
                artistsIdsChunks.forEach((artistsIdsChunk) => {
                  artistsPromises.push(
                    axios.get('https://api.spotify.com/v1/artists?ids=' + artistsIdsChunk.join(","), {
                      headers: { 'Authorization': 'Bearer ' + access_token }
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
                        url_spotify: artist.external_urls.spotify,
                        url_imagem: artist.images[0] ? artist.images[0].url : null,
                      }
                      artistsListened.push(artistModel)
                      db.collection('artistas').doc(artist.id).set(artistModel);
                    })
                  })

                  // Prepara a lista de generos escutados
                  let genresNotes = {}
                  artistsListened.forEach((artist) => {
                    // Separa os generos dos artistas escutados em uma lista:
                    // - Adiciona o próprio gênero. Se tiver espaços, substitui por hífens
                    // - Quebra os gêneros com espaço para adicionar possíveis subgêneros
                    let artistGenres = new Set()
                    artist.generos.forEach((genre) => {
                      let subGenres = genre.split(" ")
                      subGenres.forEach((subGenre) => {
                        artistGenres.add(subGenre)
                      })
                      artistGenres.add(subGenres.join("-"))
                    })
                    // Soma os generos dos artistas escutados
                    artistGenres.forEach((genre) => {
                      if(!genresNotes[genre]) {
                        genresNotes[genre] = 0
                      }
                      genresNotes[genre] += 1
                    })
                  })
                  
                  // Salva os gêneros escutados no usuário
                  db.collection('usuarios').doc(usuario.id).update({
                      generos_escutados: genresNotes
                    })

                  resolve(true)
                })
              })
          })
        })
    })
  })
}

module.exports = core