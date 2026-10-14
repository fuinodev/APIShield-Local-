import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
// Creates only a dedicated APIShield role and database; never changes existing databases or administrator credentials.
if(existsSync('.env')) {console.log('.env already exists; preserving your configuration. Run pnpm db:generate and pnpm db:migrate.');process.exit(0);}
const password=randomBytes(24).toString('hex');
const token=randomBytes(32).toString('hex');
const psql=process.env.PSQL_PATH || (process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin/psql.exe':'psql');
const query=(sql:string)=>spawnSync(psql,['-w','-h','127.0.0.1','-U',process.env.PGADMIN_USER || 'postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});
const check=query("SELECT 1 FROM pg_roles WHERE rolname='apishield_local'");
if(check.status!==0) {console.error('Unable to connect to local PostgreSQL. Set PGPASSWORD for your postgres administrator, then rerun setup.');process.exit(1);}
if(check.stdout.trim()) {console.error('Role apishield_local already exists. Configure DATABASE_URL manually using .env.example; existing credentials were not changed.');process.exit(1);}
if(query(`CREATE ROLE apishield_local LOGIN PASSWORD '${password}'`).status!==0)throw new Error('Could not create dedicated database role');
if(query('CREATE DATABASE apishield_local OWNER apishield_local').status!==0)throw new Error('Could not create database; configure .env manually');
writeFileSync('.env',`DATABASE_URL=postgresql://apishield_local:${password}@127.0.0.1:5432/apishield_local\nMANAGEMENT_TOKEN=${token}\nALLOWED_BACKEND_PORTS=8080,8081,8082\n`,{mode:0o600});
console.log('Created dedicated APIShield database and local .env. Your management token is in .env; it has not been printed.');
