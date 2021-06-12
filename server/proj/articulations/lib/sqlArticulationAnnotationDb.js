//var mysql = require('mariadb');
const mysql = require('mysql');
var async = require('async');
// const mysql = require('sync-sql');

class SqlArticulationAnnotationDb {
	constructor(params) {
		this.pool = mysql.createPool({
			connectionLimit: 100, //important
			host: params.host,
			port: params.port,
			user: params.user,
			password: params.password,
			database: params.database,
			debug: false
		});
		//this.tableName = 'articulations';
		this.tableName = 'annotated_object_articulations';
	}

	execute(queryString, queryParams, callback) {
		this.pool.query(queryString, queryParams, callback);
	}

	queryColumnNames(tablename, callback) {
		let query = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=?";
		this.execute(query, [tablename], function(err, rows) {
			if (rows) {
				rows = rows.map(function(x) { return x['COLUMN_NAME']; });
			}
			callback(err, rows);
		});
	}

	listAnnotations(callback) {
		this.queryColumnNames(this.tableName, (err, columnNames) => {
			if (err) {
				callback(err);
			} else {
				let columns = columnNames.filter(x => x != 'preview_data' && x != 'data').map( x => this.pool.escapeId(x));
				let columnStr = columns.join(',');
				this.execute(`SELECT ${columnStr} FROM ${this.tableName}`, [], callback);
			}
		});
		//this.execute(`SELECT id,modelId FROM ${this.tableName}`, [], callback);
	}

	loadAnnotation(modelId, callback) {
		//this.execute(`SELECT * FROM ${this.tableName} WHERE modelId = ?`, [modelId], callback);
		this.execute(`SELECT * FROM ${this.tableName} WHERE full_id = ?`, [modelId], callback);
	}

	loadAutoAnnotation(mpid, callback) {
		this.execute(`SELECT * FROM auto_articulations WHERE mpid = ?`, [mpid], callback);
	}

	loadAllAutoAnnotations(callback) {
        // This was changed so that it would not query for rejected auto_articulations
		this.execute(`SELECT * FROM auto_articulations WHERE wasPropagated=0 OR wasAccepted=1`, [], callback);
	}

	getPartIdFromModelId(modelId, callback){
		this.execute(`SELECT p.id, p.part_index FROM parts p WHERE p.model_id = ? `, [modelId], (err, rows) => {
			let part_json = {};
			if (err) {
				console.error(err);
			} else {
				if (rows) {
					//rows = rows.map(function(x) { return x['id','part_index']; });
					rows.forEach(part => {
						let part_id = part['id'];
						let part_index = part['part_index'];
						part_json[part_index] = part_id;
					});
				}
			}
			callback(err, part_json);
		});
	}

	getModelIdFromFullId(full_id, callback){
		
		this.execute(`SELECT id FROM objects WHERE full_id =  ? `, [full_id], (err, rows) => {
			let model_json = {};
			if (rows) {
				rows = rows.map(function(x) { return x['id']; });
				let model_id = rows[0];
				model_json['model_id'] = model_id;
				this.getPartIdFromModelId(model_id, (err, part_json) => {
					if (err) {
						console.error(err);
					} else {
						model_json['parts'] = part_json;
						callback(err, model_json);
					}
				});
			}
			
		});
	}

	saveAnnotation(full_id, annotation, callback) {
		const app_id = annotation['appId'];
		const worker_id = annotation['workerId'];
		const data = JSON.stringify(annotation['annotation']);

		const fields = ['app_id', 'worker_id', 'model_id', 'full_id', 'data'];
		const fieldsStr = fields.join(",");
		const valuesStr = fields.map(x => '?').join(',');
		const updateStr = fields.slice().map(x => `${x}=?`).join(',');

		const fields_part_ann = ['object_art_id', 'app_id', 'worker_id', 'part_id', 'data'];
		const fieldsStr_part_ann = fields_part_ann.join(",");
		const valuesStr_part_ann = fields_part_ann.map(x => '?').join(',');
		
		this.getModelIdFromFullId(full_id,  (err, result) => {
			if (err) {
				console.error(`Unable to get database modelId for ${full_id}`, err);
				callback(err, null);
			} else {
				const model_json = result;
				const model_id = model_json['model_id'];
				const part_json = model_json['parts'];

				this.pool.getConnection((err, connection) => {
					if (err) {
						if (connection) connection.release();
						callback(err, null);
						return;
					}

					connection.beginTransaction((err) => {
						if (err) {
							connection.release();
							callback(err, null);
						} else {
							try {
								const queryString = "INSERT INTO annotated_object_articulations ("+ fieldsStr+ ") VALUES(" + valuesStr + ")" +
									" ON DUPLICATE KEY UPDATE " + updateStr;

								connection.query(queryString,
									[app_id, worker_id, model_id, full_id, data, app_id, worker_id, model_id, full_id, data],
									(err, objResults) => {
										if (err) {
											return connection.rollback(function() {
												connection.release();
												callback(err, null);
											});
										} else {
											const object_articulation_id = objResults['insertId'];

											/** Deleting existing articulations for all the parts */
											const query_part_delete = "DELETE FROM annotated_part_articulations where object_art_id = ? ";
											connection.query(query_part_delete,
												[object_articulation_id],
												(err, delResults) => {
													if (err) {
														console.log('Error deleting annotated_part_articulations',err);
														return connection.rollback(function() {
															connection.release();
															callback(err, null);
														});
													} else {
														// console.log('deleted part articulations for Id=',object_articulation_id);

														/** Inserting articulations for the parts */
														const articulations = annotation['annotation']['articulations'];
														async.forEachOfSeries(articulations, (art, index, cb) => {
															let part_index = art['pid'];
															let part_id = part_json[part_index];
															let art_data = JSON.stringify(art);
															let base_part_id = art['base'][0];

															let query_part_insert = "INSERT INTO annotated_part_articulations ("+ fieldsStr_part_ann
																+ ",joint_id) VALUES(" + valuesStr_part_ann
																+ ",(select id from joints where moving_part_id=? and base_part_id = ?))";

																connection.query(query_part_insert,
																	[object_articulation_id, app_id, worker_id, part_id, art_data, part_id, base_part_id],
																	(err, partResults) => {
																		if (err) {
																			console.log('Error inserting in annotated_part_articulations',err);
																			cb(err, null);
																		} else{
																			console.log('inserted into part');
																			cb(null);
																		}
																});
														}, (err, results) => {
															if (err) {
																connection.rollback(function () {
																	connection.release();
																	callback(err, null);
																});
															} else {
																console.log('Articulations saveAnnotation: ready to commit::');
																connection.commit((err) => {
																	if (err) {
																		console.log('Articulations saveAnnotation: commit rollback');
																		connection.rollback(function() {
																			connection.release();
																			callback(err, null);
																		});
																	} else {
																		console.log('Articulations saveAnnotation:  commit success');
																		connection.release();
																		callback(null);
																	}
																});
															}
														});
													}
											});
										}
								});
							} catch(err) {
								console.log('Articulations saveAnnotation: caught error',err);
								return connection.rollback(function() {
									connection.release();
									callback(err, null);
								});
							}
						}
					});
				});

			}
		});
	}

	saveAnnotation_old(modelId, annotation, callback) {
		console.log(modelId);
		let appId = annotation['appId'];
		let workerId = annotation['workerId'];
		let data = JSON.stringify(annotation['annotation']);
		console.log(annotation['annotation']);
		// console.log(data);
		let notes = annotation['notes'];
		let fields = ['modelId', 'appId', 'workerId', 'data', 'notes'];
		let fieldsStr = fields.join(",");
		let valuesStr = fields.map(x => '?').join(',');
		let updateStr = fields.slice(1).map(x => `${x}=?`).join(',');
		this.execute(`INSERT INTO articulations (${fieldsStr}) VALUES(${valuesStr})` +
			` ON DUPLICATE KEY UPDATE ${updateStr}`,
			[modelId, appId, workerId, data, notes, appId, workerId, data, notes],
			callback
		);
	}

	saveAutoAnnotation(annotation, callback) {
		let appId = annotation['appId'];
		let workerId = annotation['workerId'];
		let mpid = annotation['mpid'];
		let data = JSON.stringify(annotation['data']);
		let transferData = JSON.stringify(annotation['transferData']);
		let sourceData = JSON.stringify(annotation['sourceData']);
		let sourceMpid = annotation['sourceMpid'];
		let wasAccepted = annotation['wasAccepted'] == 'true' ? 1 : 0;
		let rejectReason = annotation['rejectReason'];
		let wasPropagated = 1;
		let notes = annotation['notes'];
		let fields = ['mpid', 'appId', 'workerId', 'data', 'transferData', 'sourceData', 'sourceMpid', 'rejectReason' ,'wasPropagated', 'wasAccepted', 'notes'];
		let fieldsStr = fields.join(",");
		let valuesStr = fields.map(x => '?').join(',');
		this.execute(`INSERT INTO auto_articulations (${fieldsStr}) VALUES(${valuesStr})` +
			` ON DUPLICATE KEY UPDATE data = VALUES(data)`,
			[mpid, appId, workerId, data, transferData, sourceData, sourceMpid, rejectReason ,wasPropagated, wasAccepted, notes],
			callback
		);
	}
}

module.exports = SqlArticulationAnnotationDb;
