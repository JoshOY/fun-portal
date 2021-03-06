import _ from 'lodash';
import validator from 'validator';
import auth from 'basic-auth';
import errors from 'libs/errors';
import permissions from 'libs/permissions';

const utils = {};

utils.substitute = (str, obj) => {
  return str.replace(/\{([^{}]+)\}/g, (match, key) => {
    if (obj[key] !== undefined) {
      return String(obj[key]);
    }
    return `{${key}}`;
  });
};

utils.url = (s, absolute = false, obj = null) => {
  let url = `${DI.config.urlPrefix}${s}`;
  if (absolute) {
    url = `${DI.config.host}${url}`;
  }
  if (obj === null) {
    return url;
  }
  return utils.substitute(url, obj);
};

utils.static_url = (s) => {
  return `${DI.config.cdnPrefix}${s}`;
};

utils.checkCompleteProfile = () => (req, res, next) => {
  if (!req.credential.hasPermission(permissions.PROFILE)) {
    next();
    return;
  }
  if (req.credential.profile.initial) {
    res.redirect(utils.url('/user/profile'));
    return;
  }
  next();
};

utils.checkAPI = () => (req, res, next) => {
  const credentials = auth(req);
  if (!credentials
    || credentials.name !== DI.config.api.credential.username
    || credentials.pass !== DI.config.api.credential.password
  ) {
    throw new errors.PermissionError();
  }
  next();
};

utils.checkPermission = (...permissions) => (req, res, next) => {
  permissions.forEach(perm => {
    if (!req.credential.hasPermission(perm)) {
      throw new errors.PermissionError(perm);
    }
  });
  next();
};

const sanitize = (source, patterns) => {
  const ret = {};
  for (var key in patterns) {
    if (source[key] === undefined) {
      if (patterns[key].optional === true) {
        ret[key] = patterns[key].optionalValue;
      } else {
        throw new errors.ValidationError(`Missing required parameter '${key}'`);
      }
    } else {
      try {
        ret[key] = patterns[key].test(source[key]);
      } catch (err) {
        throw new errors.ValidationError(`Parameter '${key}' is expected to be a(n) ${err.message}`);
      }
    }
  }
  return ret;
};

const sanitizeExpress = (sourceAttribute, patterns) => (req, res, next) => {
  if (req.data === undefined) {
    req.data = {};
  }
  try {
    _.assign(req.data, sanitize(req[sourceAttribute], patterns));
    next();
  } catch (err) {
    next(err);
  }
};

utils.sanitizeBody = (patterns) => sanitizeExpress('body', patterns);

utils.sanitizeQuery = (patterns) => sanitizeExpress('query', patterns);

utils.sanitizeParam = (patterns) => sanitizeExpress('params', patterns);

class Checker {
  constructor(testFunc) {
    this.test = testFunc;
  }
  optional(val) {
    this.optional = true;
    this.optionalValue = val;
    return this;
  }
}

utils.checkInt = () => new Checker((any) => {
  if (typeof any === 'number') {
    return Math.floor(any);
  }
  const str = String(any);
  if (!validator.isInt(str)) {
    throw new Error('integer number');
  }
  return validator.toInt(str);
});

utils.checkString = () => new Checker((any) => {
  if (typeof any === 'string') {
    return any;
  }
  throw new Error('string');
});

utils.checkNonEmptyString = () => new Checker((any) => {
  if (typeof any === 'string') {
    if (any.trim().length === 0) {
      throw new Error('non empty string');
    }
    return any.trim();
  }
  throw new Error('non empty string');
});

utils.checkBool = () => new Checker((any) => {
  if (typeof any === 'boolean') {
    return any;
  }
  if (any === 'true') {
    return true;
  } else if (any === 'false') {
    return false;
  }
  throw new Error('boolean');
});

utils.checkPageNumber = () => new Checker((any) => {
  const str = String(any);
  if (!validator.isInt(str)) {
    throw new Error('page number');
  }
  const num = validator.toInt(str);
  if (num < 1) {
    throw new Error('page number');
  }
  return num;
});

utils.pagination = async (query, page, pageSize) => {
  const count = await query.model.count(query._conditions);
  const docs = await query.skip((page - 1) * pageSize).limit(pageSize).exec();
  const pages = Math.ceil(count / pageSize);
  return [ docs, pages, count ];
};

export default utils;
