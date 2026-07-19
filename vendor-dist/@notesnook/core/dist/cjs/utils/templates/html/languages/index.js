"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadLanguage = loadLanguage;
/* !!! THIS IS A GENERATED FILE. DO NOT EDIT !!! */
function loadLanguage(language) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (language) {
            case "html":
            case "xml":
            case "svg":
            case "mathml":
            case "ssml":
            case "atom":
            case "rss":
            case "markup":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/markup.js")));
            case "css":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/css.js")));
            case "clike":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/clike.js")));
            case "js":
            case "javascript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/javascript.js")));
            case "abap":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/abap.js")));
            case "abnf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/abnf.js")));
            case "actionscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/actionscript.js")));
            case "ada":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ada.js")));
            case "agda":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/agda.js")));
            case "al":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/al.js")));
            case "g4":
            case "antlr4":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/antlr4.js")));
            case "apacheconf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/apacheconf.js")));
            case "apex":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/apex.js")));
            case "apl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/apl.js")));
            case "applescript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/applescript.js")));
            case "aql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/aql.js")));
            case "ino":
            case "arduino":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/arduino.js")));
            case "arff":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/arff.js")));
            case "arm-asm":
            case "armasm":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/armasm.js")));
            case "art":
            case "arturo":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/arturo.js")));
            case "adoc":
            case "asciidoc":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/asciidoc.js")));
            case "aspnet":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/aspnet.js")));
            case "asm6502":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/asm6502.js")));
            case "asmatmel":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/asmatmel.js")));
            case "autohotkey":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/autohotkey.js")));
            case "autoit":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/autoit.js")));
            case "avs":
            case "avisynth":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/avisynth.js")));
            case "avdl":
            case "avro-idl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/avro-idl.js")));
            case "gawk":
            case "awk":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/awk.js")));
            case "sh":
            case "shell":
            case "bash":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bash.js")));
            case "basic":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/basic.js")));
            case "batch":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/batch.js")));
            case "shortcode":
            case "bbcode":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bbcode.js")));
            case "bbj":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bbj.js")));
            case "bicep":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bicep.js")));
            case "birb":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/birb.js")));
            case "bison":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bison.js")));
            case "rbnf":
            case "bnf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bnf.js")));
            case "bqn":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bqn.js")));
            case "brainfuck":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/brainfuck.js")));
            case "brightscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/brightscript.js")));
            case "bro":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bro.js")));
            case "oscript":
            case "bsl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/bsl.js")));
            case "c":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/c.js")));
            case "cs":
            case "dotnet":
            case "csharp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/csharp.js")));
            case "cpp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cpp.js")));
            case "cfc":
            case "cfscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cfscript.js")));
            case "chaiscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/chaiscript.js")));
            case "cil":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cil.js")));
            case "cilk-c":
            case "cilkc":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cilkc.js")));
            case "cilk-cpp":
            case "cilk":
            case "cilkcpp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cilkcpp.js")));
            case "clojure":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/clojure.js")));
            case "cmake":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cmake.js")));
            case "cobol":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cobol.js")));
            case "coffee":
            case "coffeescript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/coffeescript.js")));
            case "conc":
            case "concurnas":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/concurnas.js")));
            case "csp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/csp.js")));
            case "cooklang":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cooklang.js")));
            case "coq":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/coq.js")));
            case "crystal":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/crystal.js")));
            case "css-extras":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/css-extras.js")));
            case "csv":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/csv.js")));
            case "cue":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cue.js")));
            case "cypher":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cypher.js")));
            case "d":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/d.js")));
            case "dart":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/dart.js")));
            case "dataweave":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/dataweave.js")));
            case "dax":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/dax.js")));
            case "dhall":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/dhall.js")));
            case "diff":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/diff.js")));
            case "jinja2":
            case "django":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/django.js")));
            case "dns-zone":
            case "dns-zone-file":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/dns-zone-file.js")));
            case "dockerfile":
            case "docker":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/docker.js")));
            case "gv":
            case "dot":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/dot.js")));
            case "ebnf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ebnf.js")));
            case "editorconfig":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/editorconfig.js")));
            case "eiffel":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/eiffel.js")));
            case "eta":
            case "ejs":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ejs.js")));
            case "elixir":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/elixir.js")));
            case "elm":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/elm.js")));
            case "etlua":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/etlua.js")));
            case "erb":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/erb.js")));
            case "erlang":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/erlang.js")));
            case "xlsx":
            case "xls":
            case "excel-formula":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/excel-formula.js")));
            case "fsharp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/fsharp.js")));
            case "factor":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/factor.js")));
            case "false":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/false.js")));
            case "firestore-security-rules":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/firestore-security-rules.js")));
            case "flow":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/flow.js")));
            case "fortran":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/fortran.js")));
            case "ftl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ftl.js")));
            case "gamemakerlanguage":
            case "gml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gml.js")));
            case "gap":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gap.js")));
            case "gcode":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gcode.js")));
            case "gdscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gdscript.js")));
            case "gedcom":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gedcom.js")));
            case "po":
            case "gettext":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gettext.js")));
            case "gherkin":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gherkin.js")));
            case "git":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/git.js")));
            case "glsl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/glsl.js")));
            case "gni":
            case "gn":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gn.js")));
            case "ld":
            case "linker-script":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/linker-script.js")));
            case "go":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/go.js")));
            case "go-mod":
            case "go-module":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/go-module.js")));
            case "gradle":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/gradle.js")));
            case "graphql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/graphql.js")));
            case "groovy":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/groovy.js")));
            case "haml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/haml.js")));
            case "hbs":
            case "mustache":
            case "handlebars":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/handlebars.js")));
            case "hs":
            case "haskell":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/haskell.js")));
            case "haxe":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/haxe.js")));
            case "hcl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/hcl.js")));
            case "hlsl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/hlsl.js")));
            case "hoon":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/hoon.js")));
            case "http":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/http.js")));
            case "hpkp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/hpkp.js")));
            case "hsts":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/hsts.js")));
            case "ichigojam":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ichigojam.js")));
            case "icon":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/icon.js")));
            case "icu-message-format":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/icu-message-format.js")));
            case "idr":
            case "idris":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/idris.js")));
            case "gitignore":
            case "hgignore":
            case "npmignore":
            case "ignore":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ignore.js")));
            case "inform7":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/inform7.js")));
            case "ini":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ini.js")));
            case "io":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/io.js")));
            case "j":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/j.js")));
            case "java":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/java.js")));
            case "javadoc":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/javadoc.js")));
            case "javadoclike":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/javadoclike.js")));
            case "javastacktrace":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/javastacktrace.js")));
            case "jexl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jexl.js")));
            case "jolie":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jolie.js")));
            case "jq":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jq.js")));
            case "jsdoc":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jsdoc.js")));
            case "js-extras":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/js-extras.js")));
            case "webmanifest":
            case "json":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/json.js")));
            case "json5":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/json5.js")));
            case "jsonp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jsonp.js")));
            case "jsstacktrace":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jsstacktrace.js")));
            case "js-templates":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/js-templates.js")));
            case "julia":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/julia.js")));
            case "keepalived":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/keepalived.js")));
            case "keyman":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/keyman.js")));
            case "kt":
            case "kts":
            case "kotlin":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/kotlin.js")));
            case "kum":
            case "kumir":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/kumir.js")));
            case "kusto":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/kusto.js")));
            case "tex":
            case "context":
            case "latex":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/latex.js")));
            case "latte":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/latte.js")));
            case "less":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/less.js")));
            case "ly":
            case "lilypond":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/lilypond.js")));
            case "liquid":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/liquid.js")));
            case "emacs":
            case "elisp":
            case "emacs-lisp":
            case "lisp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/lisp.js")));
            case "livescript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/livescript.js")));
            case "llvm":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/llvm.js")));
            case "log":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/log.js")));
            case "lolcode":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/lolcode.js")));
            case "lua":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/lua.js")));
            case "magma":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/magma.js")));
            case "makefile":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/makefile.js")));
            case "md":
            case "markdown":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/markdown.js")));
            case "markup-templating":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/markup-templating.js")));
            case "mata":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/mata.js")));
            case "matlab":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/matlab.js")));
            case "maxscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/maxscript.js")));
            case "mel":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/mel.js")));
            case "mermaid":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/mermaid.js")));
            case "metafont":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/metafont.js")));
            case "mizar":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/mizar.js")));
            case "mongodb":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/mongodb.js")));
            case "monkey":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/monkey.js")));
            case "moon":
            case "moonscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/moonscript.js")));
            case "n1ql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/n1ql.js")));
            case "n4jsd":
            case "n4js":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/n4js.js")));
            case "nand2tetris-hdl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nand2tetris-hdl.js")));
            case "nani":
            case "naniscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/naniscript.js")));
            case "nasm":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nasm.js")));
            case "neon":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/neon.js")));
            case "nevod":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nevod.js")));
            case "nginx":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nginx.js")));
            case "nim":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nim.js")));
            case "nix":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nix.js")));
            case "nsis":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/nsis.js")));
            case "objc":
            case "objectivec":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/objectivec.js")));
            case "ocaml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ocaml.js")));
            case "odin":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/odin.js")));
            case "opencl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/opencl.js")));
            case "qasm":
            case "openqasm":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/openqasm.js")));
            case "oz":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/oz.js")));
            case "parigp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/parigp.js")));
            case "parser":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/parser.js")));
            case "objectpascal":
            case "pascal":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/pascal.js")));
            case "pascaligo":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/pascaligo.js")));
            case "psl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/psl.js")));
            case "px":
            case "pcaxis":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/pcaxis.js")));
            case "pcode":
            case "peoplecode":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/peoplecode.js")));
            case "perl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/perl.js")));
            case "php":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/php.js")));
            case "phpdoc":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/phpdoc.js")));
            case "php-extras":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/php-extras.js")));
            case "plantuml":
            case "plant-uml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/plant-uml.js")));
            case "plsql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/plsql.js")));
            case "pq":
            case "mscript":
            case "powerquery":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/powerquery.js")));
            case "powershell":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/powershell.js")));
            case "processing":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/processing.js")));
            case "prolog":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/prolog.js")));
            case "promql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/promql.js")));
            case "properties":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/properties.js")));
            case "protobuf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/protobuf.js")));
            case "pug":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/pug.js")));
            case "puppet":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/puppet.js")));
            case "pure":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/pure.js")));
            case "pbfasm":
            case "purebasic":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/purebasic.js")));
            case "purs":
            case "purescript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/purescript.js")));
            case "py":
            case "python":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/python.js")));
            case "qs":
            case "qsharp":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/qsharp.js")));
            case "q":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/q.js")));
            case "qml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/qml.js")));
            case "qore":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/qore.js")));
            case "r":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/r.js")));
            case "rkt":
            case "racket":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/racket.js")));
            case "razor":
            case "cshtml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/cshtml.js")));
            case "jsx":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/jsx.js")));
            case "tsx":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/tsx.js")));
            case "reason":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/reason.js")));
            case "regex":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/regex.js")));
            case "rego":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/rego.js")));
            case "rpy":
            case "renpy":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/renpy.js")));
            case "res":
            case "rescript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/rescript.js")));
            case "rest":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/rest.js")));
            case "rip":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/rip.js")));
            case "roboconf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/roboconf.js")));
            case "robot":
            case "robotframework":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/robotframework.js")));
            case "rb":
            case "ruby":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/ruby.js")));
            case "rust":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/rust.js")));
            case "sas":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/sas.js")));
            case "sass":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/sass.js")));
            case "scss":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/scss.js")));
            case "scala":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/scala.js")));
            case "scheme":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/scheme.js")));
            case "sh-session":
            case "shellsession":
            case "shell-session":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/shell-session.js")));
            case "smali":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/smali.js")));
            case "smalltalk":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/smalltalk.js")));
            case "smarty":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/smarty.js")));
            case "smlnj":
            case "sml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/sml.js")));
            case "sol":
            case "solidity":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/solidity.js")));
            case "sln":
            case "solution-file":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/solution-file.js")));
            case "soy":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/soy.js")));
            case "rq":
            case "sparql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/sparql.js")));
            case "splunk-spl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/splunk-spl.js")));
            case "sqf":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/sqf.js")));
            case "sql":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/sql.js")));
            case "squirrel":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/squirrel.js")));
            case "stan":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/stan.js")));
            case "stata":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/stata.js")));
            case "iecst":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/iecst.js")));
            case "stylus":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/stylus.js")));
            case "sclang":
            case "supercollider":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/supercollider.js")));
            case "swift":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/swift.js")));
            case "systemd":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/systemd.js")));
            case "t4-templating":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/t4-templating.js")));
            case "t4":
            case "t4-cs":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/t4-cs.js")));
            case "t4-vb":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/t4-vb.js")));
            case "tap":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/tap.js")));
            case "tcl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/tcl.js")));
            case "tt2":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/tt2.js")));
            case "textile":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/textile.js")));
            case "toml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/toml.js")));
            case "trickle":
            case "troy":
            case "tremor":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/tremor.js")));
            case "trig":
            case "turtle":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/turtle.js")));
            case "twig":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/twig.js")));
            case "ts":
            case "typescript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/typescript.js")));
            case "tsconfig":
            case "typoscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/typoscript.js")));
            case "uscript":
            case "uc":
            case "unrealscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/unrealscript.js")));
            case "uorazor":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/uorazor.js")));
            case "url":
            case "uri":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/uri.js")));
            case "v":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/v.js")));
            case "vala":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/vala.js")));
            case "vbnet":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/vbnet.js")));
            case "velocity":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/velocity.js")));
            case "verilog":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/verilog.js")));
            case "vhdl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/vhdl.js")));
            case "vim":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/vim.js")));
            case "vb":
            case "vba":
            case "visual-basic":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/visual-basic.js")));
            case "warpscript":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/warpscript.js")));
            case "wasm":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/wasm.js")));
            case "webidl":
            case "web-idl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/web-idl.js")));
            case "wgsl":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/wgsl.js")));
            case "wiki":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/wiki.js")));
            case "mathematica":
            case "nb":
            case "wl":
            case "wolfram":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/wolfram.js")));
            case "wren":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/wren.js")));
            case "xeoracube":
            case "xeora":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/xeora.js")));
            case "xml-doc":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/xml-doc.js")));
            case "xojo":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/xojo.js")));
            case "xquery":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/xquery.js")));
            case "yml":
            case "yaml":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/yaml.js")));
            case "yang":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/yang.js")));
            case "zig":
                return yield Promise.resolve().then(() => __importStar(require("refractor/lang/zig.js")));
        }
    });
}
