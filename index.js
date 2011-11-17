var http = require ('http')
  , follow = require('follow')
  , url = require('url')
  , EventEmitter = require('events').EventEmitter
  , jrest = require('json-rest')
  , a = require('assertions')
  
  
//
// this currently will check that the view and the filter are correct in the database, 
// and will update them if they are different. this should be it's own module.
// there is a lot of work that could be done to make that better, like parse the functions
// and do not update if only white space change.
// and maybe use a semver?

module.exports = function (opts) {
  var couch = jrest({ url: opts.url, auth: opts.auth });

  function makeDesign(parts) {

    var d =  {
      _id: '_design/' + parts.name,
      filters: {
      },
      views: {
      },
      language: 'javascript' //need this so that futon works
    }

    d.filters[parts.name] = parts.filter.toString()
    d.views[parts.name] = {map: parts.map.toString()}

    return d
  }

  function sync(doc, callback) {
    couch({
      path: '/' + doc._id
    }, function (err, data) {
      if(err && err.error == 'not_found') { //doc doesn't exist, create it.
        couch({
          path: '/' + doc._id,
          json: doc,
          method: 'PUT'
        }, function (err, data) {
          callback(err, data)
        })
      } else {
        //check if the doc has changed...
        var d = doc
        try {
          a.has(data, d) 
        } catch (err) { //it's changed
          d._rev = data._rev
          return couch({
            path: '/' + doc._id,
            method: 'PUT', 
            json: d
          }, function (err, data) {
            callback(err, data)
          })
        }
        return callback (err, data) // it's the same
      }
    })
  }

  /*
    atlernatively, pull the named views from the database...
    and eval them locally
    
    once there are many views to sync, will want to do that someplace else.
  */

  function syncView (parts) {
    var emitter = new EventEmitter ()

    sync(makeDesign(parts), function (err) {
    //retrive the view...
    if(err)
      return emitter.emit('error', err)
    var viewSrc = function (doc) {
      var _val  
      function emit (key, val) {
        _val = val
      }
      var filter = $FILTER;
      var map = $MAP;

      if(filter && filter(doc)) map(doc)
      return _val
    }

    //bending space and time...
    var mapper = eval('('+viewSrc.toString()
      .replace('$FILTER', (parts.filter || null).toString())
      .replace('$MAP', parts.map.toString())+')')

      couch({
        path: '/_design/' + parts.name + '/_view/' + parts.name + '?update_seq=true'
      }, function (err, data) {
        if(err) return emitter.emit('error', err)
        var seq = data.update_seq

        data.rows.forEach(function (row) {
          emitter.emit('data', row.value)
        })
        var fOpts = {
          db: opts.url,
          since: seq - 100,
          filter: parts.name+'/'+parts.name,
          include_docs: true
        }
        if(opts.auth)
        fOpts.headers = {Authorization: 'Basic ' + new Buffer(opts.auth).toString('base64')}

        var follower = follow(fOpts)
        follower.on('error', function (err) {
          emitter.emit('error', err)
        })
        follower.on('change', function (change) {
          var data = mapper(change.doc)
          if(data) emitter.emit('data', data)
        })
      })
    })
    return emitter
  }

return {
  syncDoc: sync, syncView: syncView 
}

}