import SchemaHelper from './SchemaHelper';
import DbHelper from './DbHelper';
import { debug } from '../utils';
import { lchmod } from 'node:fs';

/**
 * Manages arbitrary CRUD operations to the data layer schema objects.
 */
export class DataMapper {

    /**
     * @description The schema reference stored for usage.
     * @type {object}
     */
    schema: any;

    /**
     * Creates an instance of DataMapper.
     */
    constructor() {
		// validate the schemas on loadup?
        // Todo: can also `check database to verify the tables match
        this.schema = SchemaHelper.getSchema();
    }

    /**
     * @description Get an instance of the given type, accoroding to parameters.
     * @param {string} type
     * @param {*} [params]
     * @param {*} [limit]
     * @return {$type} Set of matching objects.
     */
    get(type: string, params?, limit?) {
		let query = this.getQueryString(type, params, limit);
        return new Promise((resolve, reject) => {
			DbHelper.query(query) 
				.then((r: any) => {
                    debug('DataMapper.get result', r);
					return resolve(r);
				})
				.catch((e) => {
                    debug('DataMapper.get error', e);
					throw e;
				})
		});
    }

    /**
     * @description Gsets the first instance of returned set, or null if none found.
     * @param {string} type
     * @param {object} [params]
     * @param {boolean} [serialize=false]
     * @return {$type | null} The first result, or null if none found.
     */
    async getOne(type: string, params?: object, serialize: boolean = false) {
        let r = await this.get(type, params, 1);
        return r.length ? r[0] : null;
    }

    /**
     * @description Updates an object if it exists, or otherwise inserts a new one.
     * @param {string} type
     * @param {object} o
     * @return {$type} Returns the new or updated object.
     */
    save(type: string, o: object) {

        // todo: should allow editing of fields but return full object...

        let query = this.upsertQueryString(type, o);
		return new Promise((resolve, reject) => {
			DbHelper.query(query)
				.then((r: any) => {
					if (!o.id) {
					    // retrieve inserted id
						if (r[r.length-1][0].last_id) {
                            o.id = r[r.length-1][0].last_id;
						}
					}
                    debug('DataMapper.save result', o);
					return resolve(o);
				})
				.catch((e) => {
                    debug('DataMapper.save error', e);
					throw e;
				})
		});
	}

    /** 
     * @description Deletes the object matching the parameters.
     * @param {string} type
     * @param {object} params
     * @return {*} The delete result.
     */
    delete(type: string, params) {
        let query = this.deleteQueryString(type, params);
        return new Promise((resolve, reject) => {
            DbHelper.query(query)
                .then((r: any) => {
                    debug('DataMapper.delete result', r);
                    return resolve(r);
                })
                .catch((e) => {
                    debug('DataMapper.delete error', e);
                    throw e;
                })
        });
    }
    
    /////////////////////////////////////////////////////////////

    getQueryString(type, params?, limit?) {
        if (!type)
            throw "Cannot get without a type";

        if (typeof this.schema[type] == 'undefined')
            throw "Unknown object type for save: " + type;

        let query = `SELECT * FROM ${type}`;

        if (params) {
            if (typeof params == 'number') {
                // todo: detect primary key property name
                query += ` WHERE id=${params}`;
            } else if (typeof params == 'object') {
                var delim = ' WHERE ';
                for (var pName in params) {
                    if (params.hasOwnProperty(pName)) {
                        let pVal = params[pName];
                        let pDef = this.schema[type][pName];
                        let pQuery = this._makePropQuery(pName, pVal, pDef);
                        query += delim + pQuery;
                        delim = ' AND';
                    }
                }
                if (limit) {
                    query += ` LIMIT ${limit}`;
                }
            } else {
                throw "Unknown parameter type to get() method. Only integer and object supported.";
            }
        }

        return query;
    }

    upsertQueryString(type, o) {
        if (!type || !o)
            throw "Cannot save without a type and an object";

        if (typeof this.schema[type] == 'undefined')
            throw "Unknown object type for save: " + type;

        let query, data, schema = this.schema[type];

        if (typeof o != 'object') {
            throw "Object parameter must be an object, " + typeof o + " found";
        }

        let sp = schema.properties;

        if (o['id']) {
            // assume an update
            var valStr = '', delim = ' ';
            for (var p in sp) {
                if (o.hasOwnProperty(p)) { 
                    let propType = this._getPropType(null, sp[p]);
                    valStr += delim + p + '=' + this.tryEscape(o[p], propType);
                    delim = ', ';
                }
            }
            query = `UPDATE ${type} SET ${valStr} WHERE id=${o['id']}`;
        } else {
            // assume an insert
            var propString = '', valStr = '', delim = '';
            for (var p in sp) {
                if (o.hasOwnProperty(p)) {
                    let propType = this._getPropType(null, sp[p]);
                    propString += delim + p;
                    valStr += delim + this.tryEscape(o[p], propType);
                    delim = ',';
                }
            }
            query = `INSERT INTO ${type} (${propString}) VALUES (${valStr});
                    SELECT LAST_INSERT_ID() as last_id;`;
        }

        return query;
    }

    deleteQueryString(type, params) {
        if (!type)
            throw "Cannot delete without a type";

        if (typeof this.schema[type] == 'undefined')
            throw "Unknown object type for save: " + type;

        if (!params.id) {
            throw "Delete requires an id parameter";
        }

        let query = `DELETE FROM ${type}`;// WHERE id=${params.id}`;

        if (params) {
            var delim = ' WHERE ';
            for (var pName in params) {
                if (params.hasOwnProperty(pName)) {
                    let pVal = params[pName];   
                    let pDef = this.schema[type][pName];
                    let pQuery = this._makePropQuery(pName, pVal, pDef);
                    query += delim + pQuery;
                    delim = ' AND';
                }
            }
        }
        
        return query;
    }

	tryEscape(propVal, propType?) {
		if (typeof propType == 'undefined')
            propType = typeof propVal;

        // TODO: these escape-per-type definitions might do better elsewhere

        // stringify object representations first
        if (typeof propVal == 'object' && propType == 'string') {
            propVal = JSON.stringify(propVal);
        } else if (propVal instanceof Date) {
            return `'${propVal.toISOString().slice(0, 19).replace('T', ' ')}'`;
        }
        
        if (['string', 'text', 'char', 'enum', 'datetime'].includes(propType)) {
			return DbHelper.escapeString(propVal)
        }

		return propVal;
    }

    // makes a 'prop=val' string, where val is properly escaped depending on its type
    _makePropQuery(pName, pVal, pDef) {
        let q = pName;
        let pType = this._getPropType(pVal, pDef);
        let eVal = this.tryEscape(pVal, pType);
        return `${pName}=${eVal}`;
    }

    _getPropType(propVal, propDef?) {
        let type = '';
        if (typeof propDef == 'object') {
            if (!propDef.type && !propDef.enum) {
                throw "Property definition requires a type property";
            } else if (propDef.enum) {
                type = 'enum';
            }
            else {
                type = propDef.type.toLowerCase();
            }
        } else if (typeof propDef == 'string') {
            type = propDef.toLowerCase();
        } else {
            type = typeof propVal;
        }
        let t = SchemaHelper.getSanitizedPropType(type);
        return t;
    }
}

export default new DataMapper();