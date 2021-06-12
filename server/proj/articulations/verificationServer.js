let VerificationServer = function (params) {
    this.db = params.sqlDB;
};

VerificationServer.prototype.getObjectCategories = function (req, res) {
    try {
        const source = req.query['source'];
        this.db.listObjectCategories(source, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Object Categories not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Object Categories.');
    }
};

VerificationServer.prototype.getPartLabels = function (req, res) {
    try {
        const source = req.query['source'];
        this.db.listPartLabels(source, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Part Labels not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Part Labels.');
    }
};

VerificationServer.prototype.getPartsForObject = function (req, res) {
    try {
        let objectId = req.query['objectId'];
        this.db.listPartsForObject(objectId, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Part Labels not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Part Labels.');
    }
};

VerificationServer.prototype.getRenderHashForPart = function (req, res) {
    try {
        let partId = req.query['partId'];
        this.db.getRenderHash(partId, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Part Labels not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Part Labels.');
    }
};

VerificationServer.prototype.getPartsGroupedByLabel = function (req, res) {
    try {

        let category = req.query['category'];
		let part = req.query['part'];
        
        this.db.listPartsGroupedByLabel(category, part, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Parts not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Parts.');
    }
};

VerificationServer.prototype.getProgramNames = function (req, res) {
    try {
        this.db.listProgramNames((err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Program Names not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error Program Names Labels.');
    }
};

VerificationServer.prototype.getData = function (req, res) {
    try {

        this.db.loadData((err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send('Error loading parts.');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading parts.');
    }
};

VerificationServer.prototype.getObjects = function (req, res) {
    try {
        let category = req.query['category'];
		let part = req.query['part'];
        let type = req.query['type'];
        let program = req.query['program'];
        let sortBy = req.query['sortBy'];
        let sortOption = req.query['sortOption'];
        let sortByConfidence = 'null';

        if (sortBy == "confidence") {
            sortByConfidence = "confidence";
        }
        
        this.db.listObjects(category, part, type, program, sortByConfidence, sortOption, (err, result) => {
            if (err) {
                console.error(err);
                res.status(400).send('Objects not found');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Objects.');
    }
};

VerificationServer.prototype.getPrograms = function (req, res) {
    const sqlError = 'Programs could not be fetched from database.';
	try {
		this.db.getPrograms((err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
				res.status(200).send(result);
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.addProgram = function (req, res) {
    // Parses and verifies the program name and motion type.
    const name = req.body.name;
    const motionType = req.body.motionType;
    if (!name) {
        res.status(400).send('The program name was invalid.');
        return;
    }
    if (!motionType || !(motionType === 'rotation' || motionType === 'translation')) {
        res.status(400).send('The program motionType was invalid.');
        return;
    }

    // Adds the new program to the database.
    const sqlError = 'Program could not be added to database.';
	try {
		this.db.addProgram(name, motionType, (err, result) => {
			if (err) {
				console.error(err);
				res.status(400).send(sqlError);
			} else if (result && result[1] && result[1][0] && result[1][0]['LAST_INSERT_ID()']){
                // Sends the LAST_INSERT_ID() as id.
				res.status(200).json({
                    'id': result[1][0]['LAST_INSERT_ID()']
                });
			} else {
                // The LAST_INSERT_ID() couldn't be found.
                res.status(500).send(sqlError);
            }
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
    }
};

VerificationServer.prototype.deleteProgram = function (req, res) {
	// Parses and verifies the program ID.
    const id = req.body.id;
    if (!id) {
        res.status(400).send('The program ID was invalid.');
        return;
    }

    // Deletes the program from the database.
    const sqlError = 'Program could not be deleted from database.';
	try {
		this.db.deleteProgram(id, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                // The deletion was successful.
				res.sendStatus(200);
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.renameProgram = function (req, res) {
	// Parses and verifies the program ID and name.
    const id = req.body.id;
    const name = req.body.name;
    if (!id) {
        res.status(400).send('The program ID was invalid.');
        return;
    }
    if (!name) {
        res.status(400).send('The program name was invalid.');
        return;
    }

    // Changes the program name.
    const sqlError = 'Program could not be renamed in database.';
	try {
		this.db.renameProgram(id, name, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                // The renaming was successful.
				res.sendStatus(200);
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.duplicateProgram = function (req, res) {
	// Parses and verifies the program ID and name.
    const id = req.body.id;
    const name = req.body.name;
    if (!id) {
        res.status(400).send('The program ID was invalid.');
        return;
    }
    if (!name) {
        res.status(400).send('The program name was invalid.');
        return;
    }

    // Duplicates the program.
    const sqlError = 'Program could not be duplicated in database.';
	try {
		this.db.duplicateProgram(id, name, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else if (result && result[1] && result[1][0] && result[1][0]['LAST_INSERT_ID()']) {
                // Sends the LAST_INSERT_ID() as id.
				res.status(200).json({
                    'id': result[1][0]['LAST_INSERT_ID()']
                });
			} else {
                // The LAST_INSERT_ID() couldn't be found.
                res.status(500).send(sqlError);
            }
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.getMotionIdentificationRules = function(req, res) {
    const sqlError = 'Motion identification rules could not be fetched.';
    try {
        const programID = req.query['id'];
        this.db.getMotionIdentificationRules(programID, (err, result) => {
            if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else if (result && result.length == 1 && 'motion_identification_rules' in result[0]) {
				res.status(200).send(result[0].motion_identification_rules);
			} else {
                console.error('getMotionIdentificationRules received an unexpected database format.');
                res.status(500).send(sqlError);
            }
        });
    } catch (err) {
        console.error(err);
		res.status(500).send(sqlError);
    }
};

VerificationServer.prototype.getMotionParameterRules = function(req, res) {
    const sqlError = 'Motion parameter rules could not be fetched.';
    try {
        const programID = req.query['id'];
        this.db.getMotionParameterRules(programID, (err, result) => {
            if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else if (result && result.length == 1 && 'motion_parameter_rules' in result[0]) {
				res.status(200).send(result[0].motion_parameter_rules);
			} else {
                console.error('getMotionParameterRules received an unexpected database format.');
                res.status(500).send(sqlError);
            }
        });
    } catch (err) {
        console.error(err);
		res.status(500).send(sqlError);
    }
};

VerificationServer.prototype.setMotionIdentificationRules = function(req, res) {
    // Parses and verifies the program ID and the preconditions.
    const id = req.body.id;
    const motionIdentificationRules = req.body.motionIdentificationRules;
    if (!id) {
        res.status(400).send('The program ID was invalid.');
        return;
    }
    if (!motionIdentificationRules) {
        res.status(400).send('The motionIdentificationRules were invalid.');
        return;
    }

    // Updates the program's motion_identification_rules.
    const sqlError = 'Motion identification rules could not be updated.';
    try {
		this.db.setMotionIdentificationRules(id, motionIdentificationRules, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                res.sendStatus(200);
            }
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
    }
};

VerificationServer.prototype.setMotionParameterRules = function(req, res) {
    // Parses and verifies the program ID and the preconditions.
    const id = req.body.id;
    const motionParameterRules = req.body.motionParameterRules;
    if (!id) {
        res.status(400).send('The program ID was invalid.');
        return;
    }
    if (!motionParameterRules) {
        res.status(400).send('The motionParameterRules were invalid.');
        return;
    }

    // Updates the program's motion_parameter_rules.
    const sqlError = 'Motion parameter rules could not be updated.';
    try {
		this.db.setMotionParameterRules(id, motionParameterRules, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                res.sendStatus(200);
            }
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
    }
};

VerificationServer.prototype.getProgramMetadata = function(req, res) {
    const sqlError = 'The program metadata could not be fetched.';
    try {
        const programID = req.query['id'];
        this.db.getProgramMetadata(programID, (err, result) => {
            if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else if (result && result.length == 1) {
				res.status(200).send(result[0]);
			} else {
                console.error('getProgramMetadata received an unexpected database format.');
                res.status(500).send(sqlError);
            }
        });
    } catch (err) {
        console.error(err);
		res.status(500).send(sqlError);
    }
};

VerificationServer.prototype.updateHashforArticulations = function (req, res){
    const parts_hash = req.body.parts_hash;

    try {
        for(let part in parts_hash){
            let partArtIdDb = parts_hash[part]['id'];
            let articulationHash = parts_hash[part]['render_hash'];
            this.db.updateRenderHashForPart(partArtIdDb, articulationHash, function(err, result) {
                if (err) {
                    console.error('Error Updating articulation hash for ' + partArtIdDb , err);
                    res.status(500).send(err);
                }
            });
        }
        res.status(200).send("Hashes saved.");
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }    
};

VerificationServer.prototype.getHashforArticulations = function (req, res){
    const fullId = req.query['fullId'];
    const partIndex = req.query['partIndex'];

    try {
        this.db.getRenderHashForPart(fullId, partIndex, function(err, result) {
            if (err) {
                console.error('Error fetching articulation hash for ' + fullId + ':' + partIndex , err);
                res.status(500).send(err);
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }  
};

VerificationServer.prototype.getArticulationInspector = function(req, res) {
    // Extracts the moving parts from the URL.
    const movingPartString = req.query['moving-part-ids'];
    if (!movingPartString) {
        res.status(400).send('Missing or invalid moving-part-ids.');
        return;
    }
    const movingPartIDs = movingPartString.split(',');

    // Gets the part information (needed to generate thumbnails).
    const sqlError = 'Could not get part information.';
    try {
		this.db.getPartInformation(movingPartIDs, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                if (!Array.isArray(result) || result.length !== movingPartIDs.length) {
                    console.log(result);
                    res.status(500).send('Moving part information could not be found. This is the result of a check that determines whether the number of rows of part information matches the number of parts in the URL. In other words, some parts are missing or duplicated in the database.');
                    return;
                }
                // Generates the thumbnails.
                const movingParts = result.map((row) => {
                    return {
                        image: `thumbnails/parts/${row.object_full_id.split('.')[0]}/articulations/part_renders/${row.object_full_id.split('.')[1]}/${row.part_index}.png`,
                        confidence: row.confidence_score,
                        programID: row.program_id,
                        movingPartIndex: row.part_index,
                        movingPartID: row.part_id,
                        movingPartName: row.part_name,
                        movingPartObjectID: row.object_id,
                        movingPartObjectFullID: row.object_full_id,
                        movingPartArticulation: JSON.parse(row.articulation_data)
                    };
                });

                // Prerenders all the moving parts into the left column.
                res.render('articulation-inspector', {
                    movingParts: movingParts
                });
            }
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
    }
}

VerificationServer.prototype.getPartInformation = function(req, res) {
    // Parses and verifies the part IDs.
    let partIDs = req.query['part-ids'];
    if (!partIDs) {
        res.status(400).send('The part IDs were invalid.');
        return;
    }
    if (!Array.isArray(partIDs)) {
        partIDs = [partIDs];
    }

    // Gets the part information from the database.
    const sqlError = 'Could not get part information.';
    try {
		this.db.getPartInformation(partIDs, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                res.status(200).send(result);
            }
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
    }
}

VerificationServer.prototype.getNumberOfParts = function(req, res) {
    const sqlError = 'Could not get part counts.';
    try{
        const source = req.query['source'];
        this.db.getNumberOfParts(source, (err, result) => {
            if (err) {
                console.error(err);
				res.status(500).send(sqlError);
            } else if (result) {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(sqlError);
    }
}

VerificationServer.prototype.addCollection = function (req, res) {
    try {

        const name = req.body.name;

        this.db.addCollection(name, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send('Error adding collection. Try again later.');
			} else if (result && result[1] && result[1][0] && result[1][0]['LAST_INSERT_ID()']){
                // Sends the LAST_INSERT_ID() as id.
				res.status(200).json({
                    'id': result[1][0]['LAST_INSERT_ID()']
                });
			} else {
                // The LAST_INSERT_ID() couldn't be found.
                res.status(500).send('Error adding collection. Try again later.');
            }
		});
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding collection. Try again later.');
    }
};

VerificationServer.prototype.getCollection = function (req, res) {
    try {

        const collectionId = req.query['id'];

        this.db.getCollection(collectionId, (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send('Error loading collection(s).');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading collection(s).');
    }
};

VerificationServer.prototype.deleteCollection = function (req, res) {
	// Parses and verifies the collection ID.
    const id = req.body.id;
    if (!id) {
        res.status(500).send('The collection ID was invalid.');
        return;
    }

    // Deletes the collection from the database.
    const sqlError = 'Collection could not be deleted from database.';
	try {
		this.db.deleteCollection(id, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                // The deletion was successful.
				res.sendStatus(200);
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.addRule = function (req, res) {
    try {

        const name = req.body.name;
        const type = req.body.type;
        const content = req.body.content;

        this.db.addRule(name, type, content, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send('Error adding Rule. Try again later.');
			} else if (result && result[1] && result[1][0] && result[1][0]['LAST_INSERT_ID()']){
                // Sends the LAST_INSERT_ID() as id.
				res.status(200).json({
                    'id': result[1][0]['LAST_INSERT_ID()']
                });
			} else {
                // The LAST_INSERT_ID() couldn't be found.
                res.status(500).send('Error adding Rule. Try again later.');
            }
		});
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding Rule. Try again later.');
    }
};

VerificationServer.prototype.deleteRule = function (req, res) {
	// Parses and verifies the rule ID.
    const id = req.body.id;
    if (!id) {
        res.status(500).send('The Rule ID was invalid.');
        return;
    }

    // Deletes the rule from the database.
    const sqlError = 'Rule could not be deleted from database.';
	try {
		this.db.deleteRule(id, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                // The deletion was successful.
				res.sendStatus(200);
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.getRule = function (req, res) {
    try {

        const ruleId = req.query['id'];

        this.db.getRule(ruleId, (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send('Error loading Rule(s).');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Rule(s).');
    }
};

VerificationServer.prototype.addRulesToCollection = function (req, res) {
    try {

        const collectionId = req.body.collection_id;
        const ruleId = req.body.rule_id;
        const name = req.body.rule_name;
        const type = req.body.rule_type;
        const content = req.body.rule_text;

        if (!collectionId) {
            res.status(500).send('The Collection ID was invalid.');
            return;
        }

        this.db.addRuleToCollection(collectionId, ruleId, name, type, content, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send('Error adding Rule. Try again later.');
			} else {
                res.sendStatus(200);
            }
		});
    } catch (err) {
        console.error(err);
        res.status(500).send('Error adding Rule. Try again later.');
    }
};

VerificationServer.prototype.deleteRulesFromCollection = function (req, res) {
	// Parses and verifies the rule ID.
    const collectionId = req.body.collection_id;
    const ruleId = req.body.rule_id;
    
    if (!collectionId) {
        res.status(500).send('The Collection ID was invalid.');
        return;
    }

    if (!ruleId) {
        res.status(500).send('The Rule ID was invalid.');
        return;
    }

    // Deletes the rule from the database.
    const sqlError = 'Rule for the Collection could not be deleted from database.';
	try {
		this.db.deleteRuleFromCollection(collectionId, ruleId, (err, result) => {
			if (err) {
				console.error(err);
				res.status(500).send(sqlError);
			} else {
                // The deletion was successful.
				res.sendStatus(200);
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).send(sqlError);
	}
};

VerificationServer.prototype.getRulesByCollection = function (req, res) {
    try {

        const ruleId = req.query['ruleId'];
        const collectionId = req.query['collectionId'];

        this.db.getRulesByCollection(collectionId, ruleId, (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).send('Error loading Rule(s) for Collection.');
            } else {
                res.status(200).send(result);
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading Rule(s) for Collection.');
    }
};

module.exports = VerificationServer;
