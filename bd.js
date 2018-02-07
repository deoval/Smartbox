const mysql = require('mysql');

/*var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "123456",
  database: "Smartbox"
});*/
var con = mysql.createConnection(process.env.JAWSDB_URL);
con.connect(function(err) {
  if (err) throw err;
});


module.exports = {

  insert: function(data, callback) {    
    var sql = "INSERT INTO users (spotify_user_id, access_token, refresh_token) VALUES ?";
    var ret;

    con.query(sql, [data], function (err, res) {
      if (err) throw err;
      //console.log("Res: " + res);
      callback(res);
    });    
  },

  select: function(callback) {    
    let sql = "select * from users";
    var foo;
    
    con.query(sql, function (err, res) {
      if (err) throw err;
      //console.log("Res: " + res);
      callback(res);
    });   
  },

}

// module.exports = function(){

//   this.select = function(){
//     // con.connect(function(err) {
//     //   if (err) throw err;
//     //   console.log("Connected!");
//     //   con.query("select * from bak_banner;", function (err, result) {
//     //     if (err) throw err;
//     //     console.log("Result: " + result[0].name);
//     //   });
//     // });
//     console.log("aa");
//   };  
// }