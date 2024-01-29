//var mysql = require('mariadb');
const mysql = require('mysql2');
// const mysql = require('sync-sql');

class SqlArticulationRenderingDb {
	constructor(params) {
		this.pool = mysql.createPool({
			connectionLimit: 100, //important
			host: params.host,
			port: params.port,
			user: params.user,
			password: params.password,
            database: params.database,
            multipleStatements: true,
			debug: false
		});
		
	}

	/**
	 * Executes a Database query with query parameters
	 * @param {*} queryString 
	 * @param {*} queryParams 
	 * @param {*} callback 
	 */
	execute(queryString, queryParams, callback) {
		this.pool.query(queryString, queryParams, callback);
	}

	/**
	 * Get column names for a table
	 * @param {*} tablename 
	 * @param {*} callback 
	 */
	queryColumnNames(tablename, callback) {
		let query = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=?";
		this.execute(query, [tablename], function(err, rows) {
			if (rows) {
				rows = rows.map(function(x) { return x['COLUMN_NAME']; });
			}
			callback(err, rows);
		});
	}
	
	/**
	 * Retrieves Hash for the part articulations for an object
	 * @param {*} fullId 
	 * @param {*} callback 
	 */
	getRenderHashForAllParts(fullId, callback) {
		let query = 'SELECT p.id as id, prt.part_index as part_index, p.render_hash as render_hash FROM articulations.annotated_part_articulations p, annotated_object_articulations o, parts prt'
				+ ' where p.object_art_id = o.id and p.part_id = prt.id and o.full_id = ? ';
		this.execute(query, [fullId], function(err, rows) {
			
			if (rows) {
				let render_dict = {};
				rows = rows.map(function(x) { 
					return {id: x['id'], part_index: x['part_index'], render_hash: x['render_hash']};
				});
				rows.forEach(part => {
					var obj = {};
					obj['id'] = part['id'];
					obj['render_hash'] = part['render_hash'];
					render_dict[part['part_index']] = obj;
				});
				callback(err, render_dict);
			} else{
				callback(err, null);
			}
		});
	}
	
	/**
	 * Retrieves Hash for the articulation
	 * @param {*} fullId 
	 * @param {*} partIndex 
	 * @param {*} callback 
	 */
	getRenderHashForPart(fullId, partIndex, callback) {
		let query = 'SELECT p.id as id, p.render_hash as render_hash FROM articulations.annotated_part_articulations p, annotated_object_articulations o, parts prt'
				+ ' where p.object_art_id = o.id and p.part_id = prt.id and o.full_id = ? and prt.part_index = ? ';
		this.execute(query, [fullId, partIndex], function(err, rows) {
			
			if (rows) {
				
				rows = rows.map(function(x) { return {id: x['id'], render_hash: x['render_hash']};});
				callback(err, rows[0]);
			}
			callback(err, null);
		});
    }
	
	/**
	 * Updates Hash for the articulation in DB
	 * @param {*} id 
	 * @param {*} newHash 
	 * @param {*} callback 
	 */
	updateRenderHashForPart(id, newHash, callback) {
		let query = 'UPDATE annotated_part_articulations SET render_hash=? WHERE id=?';
		this.execute(query, [newHash, id], callback);
    }

	
}

module.exports = SqlArticulationRenderingDb;
