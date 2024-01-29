//var mysql = require('mariadb');
const mysql = require('mysql2');
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
	 * Lists object categories available in the Database
	 * @param {*} source
	 * @param {*} callback 
	 */
	listObjectCategories(source, callback) {
		
		this.getGroupedObjectCategories(source, (err, categories) => {
			if (err) {
				callback(err);
			} else {
				let category_dict = {};
				categories.forEach(categoryString => {
					let category_arr = categoryString.split(',');
					
					category_arr.forEach(cat => {
						if(!cat.startsWith('__') && !(cat in category_dict)){
							category_dict[cat] = cat.split('_').join(' ');
						}
					});
				});
				
				callback(err, category_dict);
			}
		});
    }
	
	/**
     * Queries the database for a list of all programs.
     * This is triggered by the server when it generates the verification interface's initial HTML.
     * In other words, this is needed to compile the pug file for the verification interface.
     * @param {*} callback
     */
	getPrograms(callback) {
		let query = 'SELECT id, name FROM programs ORDER BY LOWER(name)';
		this.execute(query, [], callback); 
    }

	/**
     * Adds a new program to the database.
     * This is triggered by the user.
     * TODO: Should a new program contain properties beyond a name?
     * TODO: Should we prevent naming something that already exists?
     * @param {*} name the new program's name
     * @param {*} type the program's motion type
     * @param {*} callback
     */
	addProgram(name, type, callback) {
        const motionParameterRules = `{"motion_type":"${type}","axes": null,"ranges": null}`;
		const query = 'INSERT INTO programs (name, motion_parameter_rules) VALUES (?, ?); SELECT LAST_INSERT_ID();';
		this.execute(query, [name, motionParameterRules], callback);
    }
    
    /**
     * Deletes a program from the database.
     * This is triggered by the user.
     * TODO: Confirm whether the program needs to be deleted elsewhere.
     * @param {*} id the deleted program's ID
     * @param {*} callback
     */
	deleteProgram(id, callback) {
		let query = 'DELETE FROM programs WHERE id=?';
		this.execute(query, [id], (err, results) => {
			if (err) {
				callback(err);
			} else {
				query = 'DELETE FROM programs_to_joints WHERE program_id=?';
				this.execute(query, [id], callback);
			}
		});
    }
    
    /**
     * Renames a program in the database.
     * This is triggered by the user.
     * @param {*} id the ID of the program that will be renamed
     * @param {*} newName the new program name
     * @param {*} callback
     */
	renameProgram(id, newName, callback) {
		const query = 'UPDATE programs SET name=? WHERE id=?';
		this.execute(query, [newName, id], callback);
    }
    
    /**
     * Duplicates a program in the database.
     * TODO: Should the version be copied?
     * TODO: Since the program is a copy, should it automatically apply to the same joints as the original?
     * i.e. should programs_to_joints also update?
     * @param {*} id the ID of the program that will be duplicated
     * @param {*} duplicateName the name of the duplicate program
     * @param {*} callback
     */
	duplicateProgram(id, duplicateName, callback) {
		const query = 'INSERT INTO programs (name, motion_identification_rules, motion_parameter_rules) SELECT ?, motion_identification_rules, motion_parameter_rules FROM programs WHERE id=?; SELECT LAST_INSERT_ID();';
		this.execute(query, [duplicateName, id], callback);
    }
    
    /**
     * Gets the motion identification rules for the specified ID.
     * @param {*} id the ID of the program to find the motion identification rules for
     * @param {*} callback 
     */
    getMotionIdentificationRules(id, callback) {
        const query = 'SELECT motion_identification_rules FROM programs WHERE id=?';
        this.execute(query, [id], callback);
    }

    /**
     * Sets the motion identification rules for the specified ID.
     * @param {*} id the ID of the program to set the motion identification rules for
     * @param {JSON} motionIdentificationRules the motion identification rules (as a JSON object)
     * @param {*} callback 
     */
    setMotionIdentificationRules(id, motionIdentificationRules, callback) {
        const query = 'UPDATE programs SET motion_identification_rules = ? WHERE id=?';
        this.execute(query, [motionIdentificationRules, id], callback);
    }

    /**
     * Sets the motion parameter rules for the specified ID.
     * @param {*} id the ID of the program to set the motion parameter rules for
     * @param {JSON} motionParameterRules the motion parameter rules (as a JSON object)
     * @param {*} callback 
     */
    setMotionParameterRules(id, motionParameterRules, callback) {
        const query = 'UPDATE programs SET motion_parameter_rules = ? WHERE id=?';
        this.execute(query, [motionParameterRules, id], callback);
    }

    /**
     * Gets the motion parameter rules for the specified ID.
     * @param {*} id the ID of the program to find the motion parameter rules for
     * @param {*} callback 
     */
    getMotionParameterRules(id, callback) {
        const query = 'SELECT motion_parameter_rules FROM programs WHERE id=?';
        this.execute(query, [id], callback);
    }

    /**
     * Gets a program's metadata (name, creation and modification dates) given its ID.
     * @param {*} id the program's ID
     * @param {*} callback 
     */
    getProgramMetadata(id, callback) {
        const query = 'SELECT name, created_at, updated_at FROM programs WHERE id=?';
        this.execute(query, [id], callback);
    }

	/**
	 * Lists Grouped Object Categories
	 * @param {*} source
	 * @param {*} callback 
	 */
	getGroupedObjectCategories(source, callback) {
		let queryString = `SELECT o.category as category FROM objects o`;

		if(source !== undefined && source !== 'undefined'){
			queryString += ` WHERE LOWER(o.source) like '%` + source + `%'`;
		}

		queryString += ' order by lower(category) '
		
		this.execute(queryString, [], function(err, rows) {
			if (rows) {
				rows = rows.map(function(x) { return x['category']; });
			}
			callback(err, rows);
		});
	}

	/**
	 * Lists labels for all parts in the Database
	 * @param {*} source
	 * @param {} callback 
	 */
	listPartLabels(source, callback) {

		let queryString = `SELECT distinct p.label as label FROM parts p `;

		if (source !== undefined && source !== 'undefined') {
			queryString += ` , objects o `;
			queryString += ` WHERE o.id = p.model_id AND p.label is not null AND LOWER(o.source) like '%` + source + `%'`;
		} else {
			queryString += ` WHERE p.label is not null`;
		}

		queryString += ` order by lower(p.label) `;
		
		this.execute(queryString, [], function(err, rows) {
			let part_dict = {};
			if (rows) {
				rows = rows.map(function(x) { return x['label']; });
				rows.forEach(part => {
						if(!(part in part_dict)){
							part_dict[part] = part;
						}
					});
			}
			callback(err, part_dict);
		});
		
	}

	/**
	 * Lists Program names available in the database
	 * @param {*} callback 
	 */
	listProgramNames(callback) {

		let queryString = `SELECT distinct name FROM programs order by lower(name)`;

		this.execute(queryString, [], function(err, rows) {
			let program_dict = {};
			if (rows) {
				rows = rows.map(function(x) { return x['name']; });
				rows.forEach(program => {
						if(!(program in program_dict)){
							program_dict[program] = program;
						}
					});
			}
			callback(err, program_dict);
		});
		
	}

	/**
	 * Lists objects based on selection criteria like category,
	 * part label, etc.
	 * @param {*} category 
	 * @param {*} part 
	 * @param {*} type 
	 * @param {*} program 
	 * @param {*} sortByConfidence 
	 * @param {*} sortOption 
	 * @param {*} callback 
	 */
	listObjects(category, part, type, program, sortByConfidence, sortOption, callback) {

		let queryString = ``;

		if(type.toLowerCase().includes('unannotated')){
			queryString = `SELECT distinct u.id, u.full_id, u.updated_at FROM articulations.unannotated_objects u `;

			if(part != 'null'){
				queryString += `, parts p where u.id = p.model_id and lower(p.label) like '%` + part.toLowerCase() + `%' `;
				if(category != 'null'){
					queryString += `and lower(u.category) like '%` + category.toLowerCase() + `%' `;
				}
			} else if(category != 'null'){
				queryString += `where lower(u.category) like '%` + category.toLowerCase() + `%' `;
			}

			queryString += ` order by u.updated_at desc `;

		} else if(type.toLowerCase().includes('suggested')){
			queryString = `SELECT distinct pr.id, o.full_id, o.category, p.label, prog.name as program_name, pr.confidence_score, pr.updated_at FROM articulations.proposed_part_articulations pr, parts p, objects o, programs prog `;
			queryString += `WHERE pr.part_id = p.id AND p.model_id = o.id AND pr.program_id = prog.id `;

			if(part != 'null'){
				queryString += ` and lower(p.label) like '%` + part.toLowerCase() + `%' `;
			}
			if(category != 'null'){
				queryString += ` and lower(o.category) like '%` + category.toLowerCase() + `%' `;
			}
			if(program != 'null'){
				queryString += ` and lower(prog.name) like '%` + category.toLowerCase() + `%' `;
			}

			queryString += ` order by `;
			if(sortByConfidence != 'null'){
				queryString += `pr.confidence_score  `;
				if(sortOption != 'null'){
					queryString += sortOption;
				}
				queryString += `, `;
			}
			queryString += ` pr.updated_at desc `;

		} else if(type.toLowerCase().includes('confirmed')){
			queryString = `SELECT distinct pr.id, o.full_id, o.category, p.label, pr.updated_at FROM part_articulations pr, parts p, objects o `;
			queryString += `WHERE pr.part_id = p.id AND p.model_id = o.id `;

			if(part != 'null'){
				queryString += ` and lower(p.label) like '%` + part.toLowerCase() + `%' `;
			}
			if(category != 'null'){
				queryString += ` and lower(o.category) like '%` + category.toLowerCase() + `%' `;
			}

			queryString += ` order by pr.updated_at desc `;
			
		} else if(type.toLowerCase().includes('unconfirmed')){
			queryString = `select * from unconfirmed_articulations `;
			
			if(part != 'null'){
				queryString += ` WHERE lower(part_label) like '%` + part.toLowerCase() + `%' `;

				if(category != 'null'){
					queryString += ` and lower(object_category) like '%` + category.toLowerCase() + `%' `;
				}
			} else if(category != 'null'){
				queryString += ` WHERE lower(object_category) like '%` + category.toLowerCase() + `%' `;
			}

			queryString += ` order by updated_at desc `;
		}

		this.execute(queryString, [], function(err, rows) {
			if (rows) {
				rows = rows.map(function(x) { return {id: x['id'], full_id: x['full_id']}; });
			}
			callback(err, rows);
		});
		
	}

	/**
	 * Lists all parts for an object
	 * @param {} objectId 
	 * @param {*} callback 
	 */
	listPartsForObject(objectId, callback) {
		let queryString = `SELECT p.id as id, model_id as model_id, part_index as part_index, name as name, label as label, pr.render_hash as render_hash`;
		queryString +=` FROM parts p left outer join proposed_part_articulations pr ON pr.part_id = p.id where model_id=? order by part_index`;

		this.execute(queryString, [objectId], function(err, rows) {
			
			if (rows) {
				
				rows = rows.map(function(x) { return {
										id: x['id'], 
										model_id: x['model_id'], 
										part_index: x['part_index'], 
										name: x['name'], 
										label: x['label'],
										render_hash: x['render_hash']}; });
				
			}
			callback(err, rows);
		});
	}

	/**
	 * List all parts of all objects, grouped by part label
	 * @param {} category 
	 * @param {} part 
	 * @param {*} callback 
	 */
	listPartsGroupedByLabel(category, part, callback) {
		let queryString = `SELECT lower(p.label) as label, GROUP_CONCAT(p.id) as ids, GROUP_CONCAT(p.name) as names, GROUP_CONCAT(part_index) as part_indices, GROUP_CONCAT(o.full_id) as full_ids, GROUP_CONCAT(o.category) as categories FROM parts p, objects o where o.id = p.model_id `;

		if(category != 'null'){
			queryString += ` and lower(o.category) like '%` + category.toLowerCase() + `%' `;
		}

		if(part != 'null'){
			queryString += ` and lower(p.label) like '%` + part.toLowerCase() + `%' `;
			
		}

		queryString += ` group by lower(p.label) order by lower(p.label) `;

		this.execute(queryString, [], function(err, rows) {
			
			if (rows) {
				
				rows = rows.map(function(x) { return {label: x['label'], ids: x['ids'], names: x['names'], part_indices: x['part_indices'], full_ids: x['full_ids'], categories: x['categories']}; });
				
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
				render_dict["parts_hash"] = {};
				rows = rows.map(function(x) { 
					return {id: x['id'], part_index: x['part_index'], render_hash: x['render_hash']};
				});
				rows.forEach(part => {
					var obj = {};
					obj['id'] = part['id'];
					obj['render_hash'] = part['render_hash'];
					render_dict["parts_hash"][part['part_index']] = obj;
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
		
		if (partIndex == 'undefined' || partIndex == 'null') {

			this.getRenderHashForAllParts(fullId, callback);

		} else {

			let query = 'SELECT p.id as id, p.render_hash as render_hash, prt.part_index as part_index FROM articulations.annotated_part_articulations p, annotated_object_articulations o, parts prt'
					+ ' where p.object_art_id = o.id and p.part_id = prt.id and o.full_id = ? and prt.part_index = ? ';
			this.execute(query, [fullId, partIndex], function(err, rows) {
				
				if (rows) {
					
					rows = rows.map(function(x) { return {id: x['id'], part_index: x['part_index'], render_hash: x['render_hash']};});

					let render_dict = {};
					render_dict["parts_hash"] = {};
					rows.forEach(part => {
						var obj = {};
						obj['id'] = part['id'];
						obj['render_hash'] = part['render_hash'];
						render_dict["parts_hash"][part['part_index']] = obj;
					});
					
					callback(null, render_dict);

				} else {
					callback(err, null);
				}
			});
		}
	}
	
	/**
	 * Retrieves render has for part id
	 * @param {*} partId 
	 * @param {*} callback 
	 */
	getRenderHash(partId, callback) {

		let query = 'SELECT part_id, render_hash, updated_at FROM unconfirmed_articulations '
				+ ' where part_id = ? ORDER BY updated_at DESC LIMIT 1 ';
		this.execute(query, [partId], function(err, rows) {
			
			if (rows) {
				
				rows = rows.map(function(x) { return {part_id: x['part_id'], 
													updated_at: x['updated_at'], 
													render_hash: x['render_hash']};});
				
				callback(null, rows[0]);

			} else {
				callback(err, null);
			}
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
	
	/**
	 * Loads parts based on the specified criteria.
	 * @param {string} data_source the source of the dataset (filter)
	 * @param {string} category the object category (filter)
	 * @param {string} label the part label (filter)
	 * @param {string} type confirmed/unconfirmed view
	 * @param {string} program the program used (filter)
	 * @param {string} sortBy sorting type
	 * @param {string} groupBy grouping type
	 * @param {*} callback 
	 */
	loadData_old(data_source, category, label, type, program, sortBy, groupBy, callback) {
		let queryString = 'SELECT';

		if (groupBy.toLowerCase().includes('object_category')) {
            queryString += ' GROUP_CONCAT(full_id) AS full_id, GROUP_CONCAT(IFNULL(part_label,\'NULL\')) AS part_label, object_category AS object_category, GROUP_CONCAT(IFNULL(program_name,\'NULL\')) AS program_name, GROUP_CONCAT(IFNULL(program_id,\'NULL\')) AS program_id, ';
        } else if (groupBy.toLowerCase().includes('part')) {
            queryString += ' GROUP_CONCAT(full_id) AS full_id, part_label AS part_label, GROUP_CONCAT(IFNULL(object_category,\'NULL\')) AS object_category, GROUP_CONCAT(IFNULL(program_name,\'NULL\')) AS program_name, GROUP_CONCAT(IFNULL(program_id,\'NULL\')) AS program_id, ';
        } else if (groupBy.toLowerCase().includes('object')) {
			queryString += ' full_id AS full_id, GROUP_CONCAT(part_label) AS part_label, GROUP_CONCAT(IFNULL(object_category,\'NULL\')) AS object_category, GROUP_CONCAT(IFNULL(program_name,\'NULL\')) AS program_name, GROUP_CONCAT(IFNULL(program_id,\'NULL\')) AS program_id, ';
		} else if (groupBy.toLowerCase().includes('program_used')) {
            queryString += ' GROUP_CONCAT(full_id) AS full_id, GROUP_CONCAT(IFNULL(part_label,\'NULL\')) AS part_label, GROUP_CONCAT(IFNULL(object_category,\'NULL\')) AS object_category, IFNULL(program_name, \'None\') AS program_name, program_id AS program_id, ';
        }
        queryString += ' GROUP_CONCAT(IFNULL(art.part_id,\'NULL\')) AS part_id, GROUP_CONCAT(IFNULL(part_index,\'NULL\')) AS part_index,'
        queryString += ' GROUP_CONCAT(IFNULL(prog_confidence_score,\'NULL\')) AS confidence_score, GROUP_CONCAT(IFNULL(render_hash,\'NULL\')) AS render_hash';

		if (type.toLowerCase().includes('unconfirmed')) {
			queryString += ' FROM unconfirmed_articulations art ';
			queryString += ' INNER JOIN (SELECT part_id, MAX(updated_at) AS updated_at FROM unconfirmed_articulations ';
			queryString += ' GROUP BY part_id) max_updated ';
			queryString += ' ON max_updated.part_id = art.part_id AND max_updated.updated_at = art.updated_at '
		} else if (type.toLowerCase().includes('confirmed')) {
			queryString += ' FROM part_articulations art ';
			queryString += ' INNER JOIN (SELECT part_id, MAX(updated_at) AS updated_at FROM part_articulations ';
			queryString += ' GROUP BY part_id) max_updated ';
			queryString += ' ON max_updated.part_id = art.part_id AND max_updated.updated_at = art.updated_at '
        }
        
        // Appends the filters to the query.
        let filterCount = 0;
        let filterArguments = [];
        const filters = new Map([
			[data_source, "LOWER(source) LIKE ?"],
            [label, "LOWER(part_label) LIKE ?"],
            [category, "LOWER(object_category) LIKE ?"]
		]);
		
		if (program.toLowerCase() === 'none') {
			filters.set(program, "program_name IS NULL");
		} else if (program.toLowerCase() === 'any') {
			filters.set(program, "program_name IS NOT NULL");
		} else {
			filters.set(program, "LOWER(program_name) LIKE ?");
		}

        filters.forEach((queryComponent, filterValue) => {
            if (filterValue) {
				queryString += filterCount > 0 ? ' AND ' : ' WHERE ';
				
				if (filterValue.toLowerCase() === 'any' 
						|| filterValue.toLowerCase() === 'none') {
					queryString += queryComponent;

				} else {
					queryString += queryComponent;
					filterArguments.push('%' + filterValue + '%');
				}

				filterCount++;
            }
        });

        // Applies the grouping to the query.
		if (groupBy.toLowerCase().includes('object_category')) {
			queryString += ' GROUP BY object_category';
		} else if (groupBy.toLowerCase().includes('part')) {
			queryString += ' GROUP BY part_label';
		} else if (groupBy.toLowerCase().includes('object')) {
			queryString += ' GROUP BY full_id';
		} else if (groupBy.toLowerCase().includes('program_used')) {
			queryString += ' GROUP BY program_name, program_id';
		}

		if (sortBy.toLowerCase().includes('confidence_descending')) {
			queryString += ' ORDER BY confidence_score desc';
		} else if (sortBy.toLowerCase().includes('confidence_ascending')) {
			queryString += ' ORDER BY confidence_score';
        }
        //console.log(queryString);
		this.execute(queryString, filterArguments, function(err, rows) {
			if (rows) {
				rows = rows.map((x) => {
                    return {
                        object_full_ids: x['full_id'],
                        object_categories: x['object_category'], 
                        part_indices: x['part_index'],
                        part_ids: x['part_id'],
                        part_labels: x['part_label'],
                        program_ids: x['program_id'],
                        program_names: x['program_name'],
						confidence_scores: x['confidence_score'],
						render_hash: x['render_hash']
                    };
                });
			}
			callback(err, rows);
		});	
	}
	
	/**
	 * Loads parts based on the specified criteria.
	 * @param {string} type confirmed/unconfirmed view
	 * @param {*} callback 
	 */
	loadData(callback) {
		let queryString = 'SELECT DISTINCT';

		queryString += ' full_id as full_id, model_id, source, IFNULL(object_category, null) as category, ';
		queryString += ' JSON_OBJECT(\'part_id\', IFNULL(part_id, null), \'part_index\', IFNULL(part_index, null), \'part_label\', IFNULL(part_label, null)) AS part_json ';
		
		queryString += ' FROM all_parts ';

		queryString += ' ORDER BY full_id';

        //console.log(queryString);
		this.execute(queryString, function(err, rows) {

			let data_json_arr = [];
			if (rows) {
				let full_id = '';
				let data_json = {};
				let parts_json_arr = [];

				rows.forEach(aRow => {

					if (full_id !== aRow["full_id"]) {
						if (parts_json_arr && parts_json_arr.length > 0){
							data_json["parts"] = parts_json_arr;
							data_json_arr.push(data_json);
						}

						full_id = aRow["full_id"];

						data_json = {};
						data_json["source"] = aRow["source"];
						data_json["full_id"] = aRow["full_id"];
						data_json["category"] = aRow["category"];
						data_json["objectID"] = aRow["model_id"];
						parts_json_arr = [];
					}

					parts_json_arr.push(JSON.parse(aRow["part_json"]));

				});
				
			}
			callback(err, data_json_arr);
		});	
    }

    /**
     * Gets part information (name, index, object) for the specified parts.
     * @param {Array} partIDs the part IDs to get information for
     */
    getPartInformation(partIDs, callback) {
        let questionMarks = '';
        for (let i = 0; i < partIDs.length; i++) {
            questionMarks += '?';
            if (i !== partIDs.length - 1) {
                questionMarks += ',';
            }
        }
        const queryString = `SELECT p.id AS part_id, o.id AS object_id, o.full_id AS object_full_id, p.name AS part_name, p.part_index AS part_index, null AS articulation_data, null AS articulation_updated_at, null AS program_id, null AS confidence_score
        FROM parts p, objects o
        WHERE p.model_id = o.id AND p.id IN (${questionMarks}) AND p.id NOT IN (SELECT part_id FROM proposed_part_articulations)
        UNION ALL
        SELECT p.id AS part_id, o.id AS object_id, o.full_id AS object_full_id, p.name AS part_name, p.part_index AS part_index, ppa.data AS articulation_data, ppa.updated_at AS articulation_updated_at, ppa.program_id AS program_id, ppa.confidence_score AS confidence_score
        FROM parts p, objects o, proposed_part_articulations ppa
        INNER JOIN (
            SELECT ppa.part_id AS latest_ppa_part_id, MAX(ppa.updated_at) AS latest_ppa_updated_at FROM proposed_part_articulations ppa GROUP BY part_id
        ) latest_ppa ON latest_ppa_part_id = ppa.part_id AND latest_ppa_updated_at = ppa.updated_at
        WHERE p.model_id = o.id AND p.id IN (${questionMarks}) AND p.id = ppa.part_id;`;
        this.execute(queryString, partIDs.concat(partIDs), callback);
	}
	
	/**
	 * Returns number of parts in the dataset
	 * @param {*} dataset_source 
	 * @param {*} callback 
	 */
	getNumberOfParts(dataset_source, callback) {
		
        let query = 'SELECT COUNT(p.id) as count_parts FROM parts p, objects o WHERE p.model_id = o.id AND LOWER(o.source) = ? ';
		
		this.execute(query, [dataset_source], function(err, rows) {
			if (rows) {
				rows = rows.map((x) => {
                    return {
                        count_parts: x['count_parts']
                    };
                });
				callback(null, rows[0]);
			}
			callback(err, null);
		});
	}
	
	/**
	 * Add a collection with parameters
	 * @param {*} name 
	 * @param {*} callback 
	 */
	addCollection(name, callback) {
        const query = 'INSERT INTO collections (name) VALUES (?); SELECT LAST_INSERT_ID();';
		this.execute(query, [name], callback);
	}
	
	/**
	 * Fetch collections
	 * @param {*} collectionId 
	 * @param {*} callback 
	 */
	getCollection(collectionId, callback) {
		
        let query = 'SELECT id, name FROM collections c ';
		
		if(collectionId !== undefined && collectionId !== 'undefined'){
			query += ' WHERE c.id = ? ';
		}

		this.execute(query, [collectionId], function(err, rows) {
			if (rows) {
				rows = rows.map((x) => {
                    return {
						id: x['id'],
						name: x['name']
                    };
                });
				callback(null, rows);
			} else {
				callback(err, null);
			}
		});
	}

	/**
	 * Deletes a collection by id
	 * @param {*} id 
	 * @param {*} callback 
	 */
	deleteCollection(id, callback) {
		let query = 'DELETE FROM collections WHERE id=?';
		this.execute(query, [id], (err, results) => {
			if (err) {
				callback(err);
			} else {
				callback();
			}
		});
	}
	
	/**
	 * Add a Rule with the parameters
	 * @param {*} name 
	 * @param {*} type 
	 * @param {*} content 
	 * @param {*} callback 
	 */
	addRule(name, type, content, callback) {
        const query = 'INSERT INTO rules (name, type, rule_text) VALUES (?, ?, ?); SELECT LAST_INSERT_ID();';
		this.execute(query, [name, type, content], callback);
	}

	/**
	 * Delete a Rule by id
	 * @param {*} id 
	 * @param {*} callback 
	 */
	deleteRule(id, callback) {
		let query = 'DELETE FROM rules WHERE id=?';
		this.execute(query, [id], (err, results) => {
			if (err) {
				callback(err);
			} else {
				callback();
			}
		});
	}

	/**
	 * Fetch Rules
	 * @param {*} ruleId 
	 * @param {*} callback 
	 */
	getRule(ruleId, callback) {
		
        let query = 'SELECT id, name, type, rule_text FROM rules r ';
		
		if(ruleId !== undefined && ruleId !== 'undefined'){
			query += ' WHERE r.id = ? ';
		}

		this.execute(query, [ruleId], function(err, rows) {
			if (rows) {
				rows = rows.map((x) => {
                    return {
						id: x['id'],
						name: x['name'],
						type: x['type'],
						rule_text: x['rule_text']
                    };
                });
				callback(null, rows);
			} else {
				callback(err, null);
			}
		});
	}

	/**
	 * Adds Rule to Collection - creates a new Rule, if not found
	 * @param {*} collectionId 
	 * @param {*} ruleId 
	 * @param {*} name 
	 * @param {*} type 
	 * @param {*} content 
	 * @param {*} callback 
	 */
	addRuleToCollection(collectionId, ruleId, name, type, content, callback) {
		
		const query = 'INSERT INTO collections_to_rules (collection_id, rule_id) VALUES (?, ?);';
		
		if (ruleId && ruleId !== undefined && ruleId !== 'undefined') {
			this.execute(query, [collectionId, ruleId], callback);
		} else {
			this.addRule(name, type, content, (err, result) => {
				if (result && result[1] && result[1][0] && result[1][0]['LAST_INSERT_ID()']){
					ruleId = result[1][0]['LAST_INSERT_ID()'];
					this.execute(query, [collectionId, ruleId], callback);
				}
			});
		}

		
	}

	/**
	 * Removes Rule from Collection
	 * @param {*} collectionId 
	 * @param {*} ruleId 
	 * @param {*} callback 
	 */
	deleteRuleFromCollection(collectionId, ruleId, callback) {
		let query = 'DELETE FROM collections_to_rules WHERE collection_id=? and rule_id = ?';
		this.execute(query, [collectionId, ruleId], (err, results) => {
			if (err) {
				callback(err);
			} else {
				callback();
			}
		});
	}

	/**
	 * Retrieves Rules in a collection
	 * @param {*} collectionId 
	 * @param {*} ruleId 
	 * @param {*} callback 
	 */
	getRulesByCollection(collectionId, ruleId, callback) {
		
		let query = 'SELECT cr.collection_id as collection_id, r.id as rule_id, name as rule_name, type as rule_type, rule_text as rule_text FROM rules r, collections_to_rules cr ';
		query += ' WHERE cr.rule_id = r.id ';
		
		if (collectionId !== undefined && collectionId !== 'undefined') {
			query += ' AND cr.collection_id = ? ';
		}

		if (ruleId !== undefined && ruleId !== 'undefined') {
			query += ' AND r.id = ? ';
		}

		this.execute(query, [collectionId, ruleId], function(err, rows) {
			if (rows) {
				rows = rows.map((x) => {
                    return {
						collection_id: x['collection_id'],
						rule_id: x['rule_id'],
						rule_name: x['rule_name'],
						rule_type: x['rule_type'],
						rule_text: x['rule_text']
                    };
                });
				callback(null, rows);
			} else {
				callback(err, null);
			}
		});
	}
}

module.exports = SqlArticulationAnnotationDb;
