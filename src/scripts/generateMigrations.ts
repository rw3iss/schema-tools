/*  Intended to be run as a compiled console script. Will generate a new migrations file based on 
    the differences between schema.json file (assumed to be "new" schema), and the contents of 
    .curr.schema.json (assumed to be the old/current schema). See package.json/webpack.config.js 
*/
require('dotenv').config();
//import 'source-map-support/register';
import Config from '../lib/Config';
import MigrationHelper from '../lib/MigrationHelper';
import { existsSync, readFile, writeFile } from 'fs';
import * as path from 'path';
import commandLineArgs from 'command-line-args';

const DEFAULT_DIR = '';
const DEFAULT_SCHEMA_FILE = 'schema.json';
const DEFAULT_MIGRATIONS_DIR = 'migrations';

let opts = {};
try {
    opts = commandLineArgs([
        { name: 'config', type: String, multiple: false, defaultOption: DEFAULT_DIR },
        { name: 'schema-file', type: String, multiple: false, defaultOption: Config.schemaFile || DEFAULT_SCHEMA_FILE },
        { name: 'migrations-dir', type: String, multiple: false, defaultOption: Config.migrationsDir || DEFAULT_MIGRATIONS_DIR },
        { name: 'database-url', type: String, multiple: false }
    ]);
} catch(e) {
    console.log('Error parsing command line arguments:', e);
}

// Todo:
// this needs to lead to 

const cwd = process.cwd();
const basePath = path.resolve(cwd, opts.config ? opts.config : DEFAULT_DIR);

const schemaFile = path.resolve(cwd, opts['schema-file'] ? opts['schema-file'] : DEFAULT_SCHEMA_FILE);
const schemaDir = schemaFile.substring(0, schemaFile.lastIndexOf('/'));
const prevSchemaFile = path.resolve(schemaDir, '.curr.schema.json');

const migrationsDir = path.resolve(process.cwd(), opts['migrations-dir'] ? opts['migrations-dir'] : DEFAULT_MIGRATIONS_DIR);

let currSchema: any = {}, newSchema: any = {};

// update Config references from CLI access:
Config.basePath = basePath;
Config.schemaFile = schemaFile;
Config.prevSchemaFile = prevSchemaFile;
Config.migrationsDir = migrationsDir;

///////////////////////////////////////////////////////////////////////////////

async function main() {
    let helper = new MigrationHelper();

    if (existsSync(schemaFile)) {
        newSchema = await _readFile(schemaFile);
        if (existsSync(prevSchemaFile)) {
            currSchema = await _readFile(prevSchemaFile);
        }


        // todo: currSchema and newSchema should be parsed to "virtua model" of schema, and compared to that for changes...

        if (helper.generateMigration(currSchema, newSchema, migrationsDir)) {
            // finally backup the current schema, if there's been changes
            let currSchemaFile = path.resolve(basePath, '.curr.schema.json');
            writeFile(currSchemaFile, JSON.stringify(newSchema, null, 4), (err) => {
                if (err) console.log(err);
                console.log("Successfully saved current schema:\n", currSchemaFile);
            });
        } else {
            console.log("No schema changes found.");
        }

    } else {
        console.log("Could not locate schema file at", schemaFile);
    }
}

function _readFile(path) {
    return new Promise((resolve, reject) => {
        readFile(path, "utf8", (err, data) => {
            if (err) {
                console.log("Error reading file", path);
                return reject(err);
            }
            else {
                return resolve(data ? JSON.parse(data) : '');
            }
        });
    });
}


main();