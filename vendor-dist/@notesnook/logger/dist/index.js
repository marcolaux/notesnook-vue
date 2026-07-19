
//#region src/types.ts
let LogLevel = /* @__PURE__ */ function(LogLevel$1) {
	LogLevel$1[LogLevel$1["Fatal"] = 0] = "Fatal";
	LogLevel$1[LogLevel$1["Error"] = 1] = "Error";
	LogLevel$1[LogLevel$1["Warn"] = 2] = "Warn";
	LogLevel$1[LogLevel$1["Info"] = 3] = "Info";
	LogLevel$1[LogLevel$1["Debug"] = 4] = "Debug";
	LogLevel$1[LogLevel$1["Log"] = 5] = "Log";
	return LogLevel$1;
}({});

//#endregion
//#region src/reporters/console.ts
const consoleReporter = { write: (log) => {
	switch (log.level) {
		case LogLevel.Fatal:
			console.error(format(log));
			break;
		case LogLevel.Error:
			console.error(format(log));
			break;
		case LogLevel.Warn:
			console.warn(format(log));
			break;
		case LogLevel.Info:
			console.info(format(log));
			break;
		case LogLevel.Debug:
			console.debug(format(log));
			break;
		case LogLevel.Log:
			console.log(format(log));
			break;
	}
} };
function format(log) {
	const tokens = [
		{
			value: new Date(log.timestamp).toISOString(),
			separator: " | "
		},
		{
			value: LogLevel[log.level].toUpperCase(),
			separator: " | "
		},
		{
			value: log.scope ? `[${log.scope}]` : "",
			separator: ": "
		},
		{ value: log.message }
	];
	if (log.extras) tokens.push({ value: JSON.stringify(log.extras) });
	tokens.push({ value: `[${log.elapsed}ms]` });
	let line = "";
	for (const token of tokens) if (token.value) {
		line += token.value;
		if (token.separator) line += token.separator;
		else line += " ";
	}
	return line;
}

//#endregion
//#region src/index.ts
var Logger = class Logger {
	constructor(config = {
		reporter: consoleReporter,
		lastTime: Date.now()
	}) {
		this.config = config;
		this.fatal = errorLogLevelFactory(LogLevel.Fatal, () => this.config);
		this.warn = logLevelFactory(LogLevel.Warn, () => this.config);
		this.debug = logLevelFactory(LogLevel.Debug, () => this.config);
		this.error = errorLogLevelFactory(LogLevel.Error, () => this.config);
		this.info = logLevelFactory(LogLevel.Info, () => this.config);
		this.log = logLevelFactory(LogLevel.Log, () => this.config);
	}
	scope(scope) {
		return new Logger({
			...this.config,
			scope
		});
	}
	measure(tag) {
		performance.mark(tag);
		const marks = performance.getEntriesByName(tag, "mark");
		if (marks.length === 2) {
			const duration = marks[1].startTime - marks[0].startTime;
			this.info(`${tag} took ${duration.toFixed(2)}ms`);
			performance.clearMarks(tag);
		}
	}
};
var NoopLogger = class {
	fatal() {}
	warn() {}
	debug() {}
	error() {}
	info() {}
	log() {}
	measure() {}
	scope() {
		return this;
	}
	replaceWith(logger) {
		Object.assign(this, logger);
	}
};
function logLevelFactory(level, getConfig) {
	return (message, extras) => {
		const now = Date.now();
		const config = getConfig();
		config.reporter.write({
			level,
			message,
			timestamp: now,
			extras,
			scope: config.scope,
			elapsed: now - config.lastTime
		});
		config.lastTime = now;
	};
}
function errorLogLevelFactory(level, getConfig) {
	return (error, fallbackMessage, extras) => {
		const now = Date.now();
		const config = getConfig();
		config.reporter.write({
			level,
			message: error instanceof Error && error.stack ? error.stack.trim() : fallbackMessage ? fallbackMessage : "An unknown error occurred.",
			timestamp: now,
			extras: error instanceof Error ? {
				...extras,
				fallbackMessage
			} : error ? {
				...extras,
				error
			} : extras,
			scope: config.scope,
			elapsed: now - config.lastTime
		});
		config.lastTime = now;
	};
}
function combineReporters(reporters) {
	return { write(log) {
		for (const reporter of reporters) reporter.write(log);
	} };
}

//#endregion
exports.LogLevel = LogLevel;
exports.Logger = Logger;
exports.NoopLogger = NoopLogger;
exports.combineReporters = combineReporters;
exports.consoleReporter = consoleReporter;
exports.format = format;