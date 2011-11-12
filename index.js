var http = require ('http')
  , follow = require('follow')
  , url = require('url')
  , EventEmitter = require('events').EventEmitter
  , jrest = require('json-rest')
  , a = require('assertions')
  
  
//given a view and a filter, 
// retrive the current values and check that they are uptodate
//
// given document, 

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
          json: doc,
          method: 'PUT'
        }, function (err, data) {
          console.error(err, data)
        })
      } else {
        //check if the doc has changed...
        var d = doc
        try {
          a.has(data, d) 
        } catch (err) { //it's changed
          console.error(err.message)
          d._rev = data._rev
          return couch({
            method: 'POST', json: d
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

    sync(makeDesign(parts), function () {
    //retrive the view...

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

//    console.error(mapper.toString())

      couch({
        path: '/_design/' + parts.name + '/_view/' + parts.name + '?update_seq=true'
      }, function (err, data) {
        if(err) {console.error(err); return emitter.emit('error', err)}
          //return emitter.emit('error', err)
        var seq = data.update_seq
        console.error('SEQ', seq)
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