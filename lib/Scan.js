'use strict';

var debug = require('debug')('dynamoose:scan');

var errors = require('./errors');

function Scan (Model, filter, options) {
  this.Model = Model;
  this.options = options || {};


  // [{
  //     name: 'name',
  //     values: ['value', ...],
  //     comparison: 'string'
  //   },
  //    ...
  // ]
  this.filters = {};
  this.buildState = false;

  if(typeof filter === 'string') {
    this.buildState = filter;
    this.filters[filter] = {name: filter};
  }
}



Scan.prototype.exec = function (next) {
  debug('exec scan for ', this.scan);
  var Model = this.Model;
  var schema = Model.$__.schema;
  var options = this.options;

  var scanReq = {
    TableName: Model.$__.name
  };

  if(Object.keys(this.filters).length > 0) {
    scanReq.ScanFilter = {};
    for(var name in this.filters) {
      var filter = this.filters[name];
      var filterAttr = schema.attributes[name];
      scanReq.ScanFilter[name] = {
        AttributeValueList: [],
        ComparisonOperator: filter.comparison
      };

      if(filter.values) {
        for (var i = 0; i < filter.values.length; i++) {
          var val = filter.values[i];
          scanReq.ScanFilter[name].AttributeValueList.push(
            filterAttr.toDynamo(val, true)
          );
        }
      }
    }
  }

  if(options.attributes) {
    scanReq.AttributesToGet = options.attributes;
  }

  if(options.limit) {
    scanReq.Limit = options.limit;
  }

  if(options.ExclusiveStartKey) {
    scanReq.ExclusiveStartKey = options.ExclusiveStartKey;
  }


  debug('scan request', scanReq);
  Model.$__.base.ddb().scan(scanReq, function(err, data) {
    if(err) {
      debug('Error returned by scan', err);
      return next(err);
    }
    debug('scan response', data);

    if(!Object.keys(data).length) {
      return next();
    }

    function toModel (item) {
      var model = new Model();
      model.$__.isNew = false;
      schema.parseDynamo(model, item);

      debug('scan parsed model', model);

      return model;
    }


    var models = data.Items.map(toModel);

    next(null, models, data.LastEvaluatedKey);
  });
};

Scan.prototype.and = function() {
  return this;
};


Scan.prototype.where = function (filter) {
  if(this.buildState) {
    throw errors.ScanError('Invalid scan state; where() must follow eq()');
  }
  if(typeof filter === 'string') {
    this.buildState = filter;
    if(this.filters[filter]) {
      throw errors.ScanError('Invalid scan state; %s can only be used once', filter);
    }
    this.filters[filter] = {name: filter};
  }

  return this;
};

Scan.prototype.compVal = function (vals, comp) {
  if(!this.buildState) {
    throw errors.ScanError('Invalid scan state; %s must follow scan(\'string\') or where(\'string\')', comp);
  }

  this.filters[this.buildState].values = vals;
  this.filters[this.buildState].comparison = comp;

  this.buildState = false;
  this.notState = false;

  return this;
};


Scan.prototype.not = function() {
  this.notState = true;
  return this;
};

Scan.prototype.null = function() {
  if(this.notState) {
    return this.compVal(null, 'NOT_NULL');
  } else {
    return this.compVal(null, 'NULL');
  }
};


Scan.prototype.eq = function (val) {
  if(this.notState) {
    return this.compVal([val], 'NE');
  } else {
    return this.compVal([val], 'EQ');
  }
};


Scan.prototype.lt = function (val) {
  if(this.notState) {
    return this.compVal([val], 'GE');
  } else {
    return this.compVal([val], 'LT');
  }
};

Scan.prototype.le = function (val) {
  if(this.notState) {
    return this.compVal([val], 'GT');
  } else {
    return this.compVal([val], 'LE');
  }
};

Scan.prototype.ge = function (val) {
  if(this.notState) {
    return this.compVal([val], 'LT');
  } else {
    return this.compVal([val], 'GE');
  }
};

Scan.prototype.gt = function (val) {
  if(this.notState) {
    return this.compVal([val], 'LE');
  } else {
    return this.compVal([val], 'GT');
  }
};

Scan.prototype.contains = function (val) {
  if(this.notState) {
    return this.compVal([val], 'NOT_CONTAINS');
  } else {
    return this.compVal([val], 'CONTAINS');
  }
};

Scan.prototype.beginsWith = function (val) {
  if(this.notState) {
    throw new errors.ScanError('Invalid scan state: beginsWith() cannot follow not()');
  }
  return this.compVal([val], 'BEGINS_WITH');
};

Scan.prototype.in = function (vals) {
  if(this.notState) {
    throw new errors.ScanError('Invalid scan state: in() cannot follow not()');
  }

  return this.compVal(vals, 'IN');
};

Scan.prototype.between = function (a, b) {
  if(this.notState) {
    throw new errors.ScanError('Invalid scan state: between() cannot follow not()');
  }
  return this.compVal([a, b], 'BETWEEN');
};

Scan.prototype.limit = function (limit) {
  this.options.limit = limit;
  return this;
};

Scan.prototype.startAt = function (key) {
  this.options.ExclusiveStartKey = key;
  return this;
};

Scan.prototype.attributes = function (attributes) {
  this.options.attributes = attributes;
  return this;
};

module.exports = Scan;