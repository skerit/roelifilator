var target_path,
    libpath  = require('path'),
    Blast    = require('protoblast')(true),
    tree     = new Deck(),
    nav      = [],
    fs       = require('fs');

module.exports = function roelifilator(source_path, callback) {

	fs.readdir(source_path, function gotSourceFiles(err, files) {

		var tasks,
		    date;

		if (err) {
			throw err;
		}

		// Prepare the tasks array
		tasks = [];

		// Prepare the date object, which will be set to the start of today
		date = (new Date()).startOf('day') / 1000;

		// Iterate over each file
		files.forEach(function eachFile(file) {

			var pieces_string,
			    file_path,
			    last_name,
			    current,
			    pieces,
			    order;

			pieces_string = file.beforeLast('.pug').trim();

			// String did not end with ".pug" so we skip it
			if (!pieces_string) {
				return;
			}

			file_path = libpath.resolve(source_path, file);

			// Push this function to the "tasks" array,
			// we'll process them in parallel later
			tasks.push(function processFile(next) {

				// Get the order, if any
				order = /\((\d+)\)$/.exec(pieces_string);

				if (order) {
					order = parseInt(order[1]);
					pieces_string = pieces_string.replace(/\((\d+)\)$/, '').trim();
				}

				// Split all the strings by the '>' character, surrounded by whitespaces
				pieces = pieces_string.split(/\s+\>\s+/g);

				// Get the last piece name
				last_name = pieces.last();

				// Reset current to the root of the tree
				current = tree;

				// Iterate over all the piece names in the filename
				pieces.forEach(function eachPieceName(name) {

					var piece;

					piece = current.get(name);

					// If the piece doesn't exist in the deck object yet,
					// create it now
					if (!piece) {
						piece = new Deck();
						piece.name = name;
						piece.parent = current;
						current.set(name, piece);
					}

					current = piece;
				});

				// Now that we have processed the entire filename,
				// the "current" variable will be pointing to the last piece

				if (order > -1) {
					current.order = order;
					current.parent.set(current.name, current, 999-order);
				}

				current.file_path = file_path;

				// Now read in the file in order to get the title
				fs.readFile(file_path, 'utf-8', function gotFile(err, text) {

					var result;

					if (err) {
						return next(err);
					}

					result = /\Wtitle\W(.*)/.exec(text);

					if (!result || !result[1]) {
						return next();
					}

					result = result[1];

					//console.log('File "' + file + '" title: ' + result);

					current.title = result;
					next();
				});
			});
		});

		// Perform all the queued tasks now:
		// Add all the files to the deck object first
		Function.parallel(tasks, function done(err) {

			var touch_tasks,
			    current,
			    counter = 1,
			    cpath;

			if (err) {
				console.log('Error processing files!');
				throw err;
			}

			current = nav;

			touch_tasks = [];

			// Iterate over the tree
			tree.forEach(function eachTreeEntry(value, key, index, all_items) {

				var entry,
				    mtime,
				    ppath,
				    prev;

				// Convert date object to number and add the counter to it,
				// and also increment the counter for the next time
				mtime = Number(date) + counter++;

				if (value.file_path) {
					touch_tasks.push(function setUTime(next) {
						fs.utimes(value.file_path, mtime, mtime, next);
					});
				}

				// Make a reference to the previous nav array
				prev = current;

				// And the previous path
				ppath = cpath;

				if (cpath) {
					cpath += '/';
				} else {
					cpath = '';
				}

				cpath += key;

				entry = {
					name     : key,
					path     : cpath,
					title    : value.title,
					subnav   : []
				};

				prev.push(entry);

				current = entry.subnav;

				// Recursively do the children of this piece
				value.forEach(eachTreeEntry);

				cpath = ppath;
				current = prev;
			});

			// Now set all the change dates
			Function.parallel(touch_tasks, function done(err) {

				if (err) {
					console.log('Error updating modification times');
					throw err;
				}

				callback(null, nav, tree);
			});
		});
	});
};