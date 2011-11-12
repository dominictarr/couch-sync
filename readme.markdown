# couch-sync

this is like following a view!

`couch-sync` requests a view, then listens on the _changes feed, pipeing the results through the map function
so that you have always upto date view data, in memory!

``` bash
npm install couch-sync
```

``` js
var sync = require('couch-sync')
  ({url: 'http:you.iriscouch.com/database', auth: ...})
  ({
    name: 'whatever', //name for design doc
    filter: function (doc) {
     //see the couch documentation for filters
    
    },
    map: function (doc) {
      // see the couch documentation for views
    
    }
  })

sync.on('data', function (doc) {
  //doc will be 
})

```

##todo

* encourage the couchdb team to include this feature into couchdb