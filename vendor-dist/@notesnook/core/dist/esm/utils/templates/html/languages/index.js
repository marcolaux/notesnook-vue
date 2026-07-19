var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* !!! THIS IS A GENERATED FILE. DO NOT EDIT !!! */
export function loadLanguage(language) {
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
                return yield import("refractor/lang/markup.js");
            case "css":
                return yield import("refractor/lang/css.js");
            case "clike":
                return yield import("refractor/lang/clike.js");
            case "js":
            case "javascript":
                return yield import("refractor/lang/javascript.js");
            case "abap":
                return yield import("refractor/lang/abap.js");
            case "abnf":
                return yield import("refractor/lang/abnf.js");
            case "actionscript":
                return yield import("refractor/lang/actionscript.js");
            case "ada":
                return yield import("refractor/lang/ada.js");
            case "agda":
                return yield import("refractor/lang/agda.js");
            case "al":
                return yield import("refractor/lang/al.js");
            case "g4":
            case "antlr4":
                return yield import("refractor/lang/antlr4.js");
            case "apacheconf":
                return yield import("refractor/lang/apacheconf.js");
            case "apex":
                return yield import("refractor/lang/apex.js");
            case "apl":
                return yield import("refractor/lang/apl.js");
            case "applescript":
                return yield import("refractor/lang/applescript.js");
            case "aql":
                return yield import("refractor/lang/aql.js");
            case "ino":
            case "arduino":
                return yield import("refractor/lang/arduino.js");
            case "arff":
                return yield import("refractor/lang/arff.js");
            case "arm-asm":
            case "armasm":
                return yield import("refractor/lang/armasm.js");
            case "art":
            case "arturo":
                return yield import("refractor/lang/arturo.js");
            case "adoc":
            case "asciidoc":
                return yield import("refractor/lang/asciidoc.js");
            case "aspnet":
                return yield import("refractor/lang/aspnet.js");
            case "asm6502":
                return yield import("refractor/lang/asm6502.js");
            case "asmatmel":
                return yield import("refractor/lang/asmatmel.js");
            case "autohotkey":
                return yield import("refractor/lang/autohotkey.js");
            case "autoit":
                return yield import("refractor/lang/autoit.js");
            case "avs":
            case "avisynth":
                return yield import("refractor/lang/avisynth.js");
            case "avdl":
            case "avro-idl":
                return yield import("refractor/lang/avro-idl.js");
            case "gawk":
            case "awk":
                return yield import("refractor/lang/awk.js");
            case "sh":
            case "shell":
            case "bash":
                return yield import("refractor/lang/bash.js");
            case "basic":
                return yield import("refractor/lang/basic.js");
            case "batch":
                return yield import("refractor/lang/batch.js");
            case "shortcode":
            case "bbcode":
                return yield import("refractor/lang/bbcode.js");
            case "bbj":
                return yield import("refractor/lang/bbj.js");
            case "bicep":
                return yield import("refractor/lang/bicep.js");
            case "birb":
                return yield import("refractor/lang/birb.js");
            case "bison":
                return yield import("refractor/lang/bison.js");
            case "rbnf":
            case "bnf":
                return yield import("refractor/lang/bnf.js");
            case "bqn":
                return yield import("refractor/lang/bqn.js");
            case "brainfuck":
                return yield import("refractor/lang/brainfuck.js");
            case "brightscript":
                return yield import("refractor/lang/brightscript.js");
            case "bro":
                return yield import("refractor/lang/bro.js");
            case "oscript":
            case "bsl":
                return yield import("refractor/lang/bsl.js");
            case "c":
                return yield import("refractor/lang/c.js");
            case "cs":
            case "dotnet":
            case "csharp":
                return yield import("refractor/lang/csharp.js");
            case "cpp":
                return yield import("refractor/lang/cpp.js");
            case "cfc":
            case "cfscript":
                return yield import("refractor/lang/cfscript.js");
            case "chaiscript":
                return yield import("refractor/lang/chaiscript.js");
            case "cil":
                return yield import("refractor/lang/cil.js");
            case "cilk-c":
            case "cilkc":
                return yield import("refractor/lang/cilkc.js");
            case "cilk-cpp":
            case "cilk":
            case "cilkcpp":
                return yield import("refractor/lang/cilkcpp.js");
            case "clojure":
                return yield import("refractor/lang/clojure.js");
            case "cmake":
                return yield import("refractor/lang/cmake.js");
            case "cobol":
                return yield import("refractor/lang/cobol.js");
            case "coffee":
            case "coffeescript":
                return yield import("refractor/lang/coffeescript.js");
            case "conc":
            case "concurnas":
                return yield import("refractor/lang/concurnas.js");
            case "csp":
                return yield import("refractor/lang/csp.js");
            case "cooklang":
                return yield import("refractor/lang/cooklang.js");
            case "coq":
                return yield import("refractor/lang/coq.js");
            case "crystal":
                return yield import("refractor/lang/crystal.js");
            case "css-extras":
                return yield import("refractor/lang/css-extras.js");
            case "csv":
                return yield import("refractor/lang/csv.js");
            case "cue":
                return yield import("refractor/lang/cue.js");
            case "cypher":
                return yield import("refractor/lang/cypher.js");
            case "d":
                return yield import("refractor/lang/d.js");
            case "dart":
                return yield import("refractor/lang/dart.js");
            case "dataweave":
                return yield import("refractor/lang/dataweave.js");
            case "dax":
                return yield import("refractor/lang/dax.js");
            case "dhall":
                return yield import("refractor/lang/dhall.js");
            case "diff":
                return yield import("refractor/lang/diff.js");
            case "jinja2":
            case "django":
                return yield import("refractor/lang/django.js");
            case "dns-zone":
            case "dns-zone-file":
                return yield import("refractor/lang/dns-zone-file.js");
            case "dockerfile":
            case "docker":
                return yield import("refractor/lang/docker.js");
            case "gv":
            case "dot":
                return yield import("refractor/lang/dot.js");
            case "ebnf":
                return yield import("refractor/lang/ebnf.js");
            case "editorconfig":
                return yield import("refractor/lang/editorconfig.js");
            case "eiffel":
                return yield import("refractor/lang/eiffel.js");
            case "eta":
            case "ejs":
                return yield import("refractor/lang/ejs.js");
            case "elixir":
                return yield import("refractor/lang/elixir.js");
            case "elm":
                return yield import("refractor/lang/elm.js");
            case "etlua":
                return yield import("refractor/lang/etlua.js");
            case "erb":
                return yield import("refractor/lang/erb.js");
            case "erlang":
                return yield import("refractor/lang/erlang.js");
            case "xlsx":
            case "xls":
            case "excel-formula":
                return yield import("refractor/lang/excel-formula.js");
            case "fsharp":
                return yield import("refractor/lang/fsharp.js");
            case "factor":
                return yield import("refractor/lang/factor.js");
            case "false":
                return yield import("refractor/lang/false.js");
            case "firestore-security-rules":
                return yield import("refractor/lang/firestore-security-rules.js");
            case "flow":
                return yield import("refractor/lang/flow.js");
            case "fortran":
                return yield import("refractor/lang/fortran.js");
            case "ftl":
                return yield import("refractor/lang/ftl.js");
            case "gamemakerlanguage":
            case "gml":
                return yield import("refractor/lang/gml.js");
            case "gap":
                return yield import("refractor/lang/gap.js");
            case "gcode":
                return yield import("refractor/lang/gcode.js");
            case "gdscript":
                return yield import("refractor/lang/gdscript.js");
            case "gedcom":
                return yield import("refractor/lang/gedcom.js");
            case "po":
            case "gettext":
                return yield import("refractor/lang/gettext.js");
            case "gherkin":
                return yield import("refractor/lang/gherkin.js");
            case "git":
                return yield import("refractor/lang/git.js");
            case "glsl":
                return yield import("refractor/lang/glsl.js");
            case "gni":
            case "gn":
                return yield import("refractor/lang/gn.js");
            case "ld":
            case "linker-script":
                return yield import("refractor/lang/linker-script.js");
            case "go":
                return yield import("refractor/lang/go.js");
            case "go-mod":
            case "go-module":
                return yield import("refractor/lang/go-module.js");
            case "gradle":
                return yield import("refractor/lang/gradle.js");
            case "graphql":
                return yield import("refractor/lang/graphql.js");
            case "groovy":
                return yield import("refractor/lang/groovy.js");
            case "haml":
                return yield import("refractor/lang/haml.js");
            case "hbs":
            case "mustache":
            case "handlebars":
                return yield import("refractor/lang/handlebars.js");
            case "hs":
            case "haskell":
                return yield import("refractor/lang/haskell.js");
            case "haxe":
                return yield import("refractor/lang/haxe.js");
            case "hcl":
                return yield import("refractor/lang/hcl.js");
            case "hlsl":
                return yield import("refractor/lang/hlsl.js");
            case "hoon":
                return yield import("refractor/lang/hoon.js");
            case "http":
                return yield import("refractor/lang/http.js");
            case "hpkp":
                return yield import("refractor/lang/hpkp.js");
            case "hsts":
                return yield import("refractor/lang/hsts.js");
            case "ichigojam":
                return yield import("refractor/lang/ichigojam.js");
            case "icon":
                return yield import("refractor/lang/icon.js");
            case "icu-message-format":
                return yield import("refractor/lang/icu-message-format.js");
            case "idr":
            case "idris":
                return yield import("refractor/lang/idris.js");
            case "gitignore":
            case "hgignore":
            case "npmignore":
            case "ignore":
                return yield import("refractor/lang/ignore.js");
            case "inform7":
                return yield import("refractor/lang/inform7.js");
            case "ini":
                return yield import("refractor/lang/ini.js");
            case "io":
                return yield import("refractor/lang/io.js");
            case "j":
                return yield import("refractor/lang/j.js");
            case "java":
                return yield import("refractor/lang/java.js");
            case "javadoc":
                return yield import("refractor/lang/javadoc.js");
            case "javadoclike":
                return yield import("refractor/lang/javadoclike.js");
            case "javastacktrace":
                return yield import("refractor/lang/javastacktrace.js");
            case "jexl":
                return yield import("refractor/lang/jexl.js");
            case "jolie":
                return yield import("refractor/lang/jolie.js");
            case "jq":
                return yield import("refractor/lang/jq.js");
            case "jsdoc":
                return yield import("refractor/lang/jsdoc.js");
            case "js-extras":
                return yield import("refractor/lang/js-extras.js");
            case "webmanifest":
            case "json":
                return yield import("refractor/lang/json.js");
            case "json5":
                return yield import("refractor/lang/json5.js");
            case "jsonp":
                return yield import("refractor/lang/jsonp.js");
            case "jsstacktrace":
                return yield import("refractor/lang/jsstacktrace.js");
            case "js-templates":
                return yield import("refractor/lang/js-templates.js");
            case "julia":
                return yield import("refractor/lang/julia.js");
            case "keepalived":
                return yield import("refractor/lang/keepalived.js");
            case "keyman":
                return yield import("refractor/lang/keyman.js");
            case "kt":
            case "kts":
            case "kotlin":
                return yield import("refractor/lang/kotlin.js");
            case "kum":
            case "kumir":
                return yield import("refractor/lang/kumir.js");
            case "kusto":
                return yield import("refractor/lang/kusto.js");
            case "tex":
            case "context":
            case "latex":
                return yield import("refractor/lang/latex.js");
            case "latte":
                return yield import("refractor/lang/latte.js");
            case "less":
                return yield import("refractor/lang/less.js");
            case "ly":
            case "lilypond":
                return yield import("refractor/lang/lilypond.js");
            case "liquid":
                return yield import("refractor/lang/liquid.js");
            case "emacs":
            case "elisp":
            case "emacs-lisp":
            case "lisp":
                return yield import("refractor/lang/lisp.js");
            case "livescript":
                return yield import("refractor/lang/livescript.js");
            case "llvm":
                return yield import("refractor/lang/llvm.js");
            case "log":
                return yield import("refractor/lang/log.js");
            case "lolcode":
                return yield import("refractor/lang/lolcode.js");
            case "lua":
                return yield import("refractor/lang/lua.js");
            case "magma":
                return yield import("refractor/lang/magma.js");
            case "makefile":
                return yield import("refractor/lang/makefile.js");
            case "md":
            case "markdown":
                return yield import("refractor/lang/markdown.js");
            case "markup-templating":
                return yield import("refractor/lang/markup-templating.js");
            case "mata":
                return yield import("refractor/lang/mata.js");
            case "matlab":
                return yield import("refractor/lang/matlab.js");
            case "maxscript":
                return yield import("refractor/lang/maxscript.js");
            case "mel":
                return yield import("refractor/lang/mel.js");
            case "mermaid":
                return yield import("refractor/lang/mermaid.js");
            case "metafont":
                return yield import("refractor/lang/metafont.js");
            case "mizar":
                return yield import("refractor/lang/mizar.js");
            case "mongodb":
                return yield import("refractor/lang/mongodb.js");
            case "monkey":
                return yield import("refractor/lang/monkey.js");
            case "moon":
            case "moonscript":
                return yield import("refractor/lang/moonscript.js");
            case "n1ql":
                return yield import("refractor/lang/n1ql.js");
            case "n4jsd":
            case "n4js":
                return yield import("refractor/lang/n4js.js");
            case "nand2tetris-hdl":
                return yield import("refractor/lang/nand2tetris-hdl.js");
            case "nani":
            case "naniscript":
                return yield import("refractor/lang/naniscript.js");
            case "nasm":
                return yield import("refractor/lang/nasm.js");
            case "neon":
                return yield import("refractor/lang/neon.js");
            case "nevod":
                return yield import("refractor/lang/nevod.js");
            case "nginx":
                return yield import("refractor/lang/nginx.js");
            case "nim":
                return yield import("refractor/lang/nim.js");
            case "nix":
                return yield import("refractor/lang/nix.js");
            case "nsis":
                return yield import("refractor/lang/nsis.js");
            case "objc":
            case "objectivec":
                return yield import("refractor/lang/objectivec.js");
            case "ocaml":
                return yield import("refractor/lang/ocaml.js");
            case "odin":
                return yield import("refractor/lang/odin.js");
            case "opencl":
                return yield import("refractor/lang/opencl.js");
            case "qasm":
            case "openqasm":
                return yield import("refractor/lang/openqasm.js");
            case "oz":
                return yield import("refractor/lang/oz.js");
            case "parigp":
                return yield import("refractor/lang/parigp.js");
            case "parser":
                return yield import("refractor/lang/parser.js");
            case "objectpascal":
            case "pascal":
                return yield import("refractor/lang/pascal.js");
            case "pascaligo":
                return yield import("refractor/lang/pascaligo.js");
            case "psl":
                return yield import("refractor/lang/psl.js");
            case "px":
            case "pcaxis":
                return yield import("refractor/lang/pcaxis.js");
            case "pcode":
            case "peoplecode":
                return yield import("refractor/lang/peoplecode.js");
            case "perl":
                return yield import("refractor/lang/perl.js");
            case "php":
                return yield import("refractor/lang/php.js");
            case "phpdoc":
                return yield import("refractor/lang/phpdoc.js");
            case "php-extras":
                return yield import("refractor/lang/php-extras.js");
            case "plantuml":
            case "plant-uml":
                return yield import("refractor/lang/plant-uml.js");
            case "plsql":
                return yield import("refractor/lang/plsql.js");
            case "pq":
            case "mscript":
            case "powerquery":
                return yield import("refractor/lang/powerquery.js");
            case "powershell":
                return yield import("refractor/lang/powershell.js");
            case "processing":
                return yield import("refractor/lang/processing.js");
            case "prolog":
                return yield import("refractor/lang/prolog.js");
            case "promql":
                return yield import("refractor/lang/promql.js");
            case "properties":
                return yield import("refractor/lang/properties.js");
            case "protobuf":
                return yield import("refractor/lang/protobuf.js");
            case "pug":
                return yield import("refractor/lang/pug.js");
            case "puppet":
                return yield import("refractor/lang/puppet.js");
            case "pure":
                return yield import("refractor/lang/pure.js");
            case "pbfasm":
            case "purebasic":
                return yield import("refractor/lang/purebasic.js");
            case "purs":
            case "purescript":
                return yield import("refractor/lang/purescript.js");
            case "py":
            case "python":
                return yield import("refractor/lang/python.js");
            case "qs":
            case "qsharp":
                return yield import("refractor/lang/qsharp.js");
            case "q":
                return yield import("refractor/lang/q.js");
            case "qml":
                return yield import("refractor/lang/qml.js");
            case "qore":
                return yield import("refractor/lang/qore.js");
            case "r":
                return yield import("refractor/lang/r.js");
            case "rkt":
            case "racket":
                return yield import("refractor/lang/racket.js");
            case "razor":
            case "cshtml":
                return yield import("refractor/lang/cshtml.js");
            case "jsx":
                return yield import("refractor/lang/jsx.js");
            case "tsx":
                return yield import("refractor/lang/tsx.js");
            case "reason":
                return yield import("refractor/lang/reason.js");
            case "regex":
                return yield import("refractor/lang/regex.js");
            case "rego":
                return yield import("refractor/lang/rego.js");
            case "rpy":
            case "renpy":
                return yield import("refractor/lang/renpy.js");
            case "res":
            case "rescript":
                return yield import("refractor/lang/rescript.js");
            case "rest":
                return yield import("refractor/lang/rest.js");
            case "rip":
                return yield import("refractor/lang/rip.js");
            case "roboconf":
                return yield import("refractor/lang/roboconf.js");
            case "robot":
            case "robotframework":
                return yield import("refractor/lang/robotframework.js");
            case "rb":
            case "ruby":
                return yield import("refractor/lang/ruby.js");
            case "rust":
                return yield import("refractor/lang/rust.js");
            case "sas":
                return yield import("refractor/lang/sas.js");
            case "sass":
                return yield import("refractor/lang/sass.js");
            case "scss":
                return yield import("refractor/lang/scss.js");
            case "scala":
                return yield import("refractor/lang/scala.js");
            case "scheme":
                return yield import("refractor/lang/scheme.js");
            case "sh-session":
            case "shellsession":
            case "shell-session":
                return yield import("refractor/lang/shell-session.js");
            case "smali":
                return yield import("refractor/lang/smali.js");
            case "smalltalk":
                return yield import("refractor/lang/smalltalk.js");
            case "smarty":
                return yield import("refractor/lang/smarty.js");
            case "smlnj":
            case "sml":
                return yield import("refractor/lang/sml.js");
            case "sol":
            case "solidity":
                return yield import("refractor/lang/solidity.js");
            case "sln":
            case "solution-file":
                return yield import("refractor/lang/solution-file.js");
            case "soy":
                return yield import("refractor/lang/soy.js");
            case "rq":
            case "sparql":
                return yield import("refractor/lang/sparql.js");
            case "splunk-spl":
                return yield import("refractor/lang/splunk-spl.js");
            case "sqf":
                return yield import("refractor/lang/sqf.js");
            case "sql":
                return yield import("refractor/lang/sql.js");
            case "squirrel":
                return yield import("refractor/lang/squirrel.js");
            case "stan":
                return yield import("refractor/lang/stan.js");
            case "stata":
                return yield import("refractor/lang/stata.js");
            case "iecst":
                return yield import("refractor/lang/iecst.js");
            case "stylus":
                return yield import("refractor/lang/stylus.js");
            case "sclang":
            case "supercollider":
                return yield import("refractor/lang/supercollider.js");
            case "swift":
                return yield import("refractor/lang/swift.js");
            case "systemd":
                return yield import("refractor/lang/systemd.js");
            case "t4-templating":
                return yield import("refractor/lang/t4-templating.js");
            case "t4":
            case "t4-cs":
                return yield import("refractor/lang/t4-cs.js");
            case "t4-vb":
                return yield import("refractor/lang/t4-vb.js");
            case "tap":
                return yield import("refractor/lang/tap.js");
            case "tcl":
                return yield import("refractor/lang/tcl.js");
            case "tt2":
                return yield import("refractor/lang/tt2.js");
            case "textile":
                return yield import("refractor/lang/textile.js");
            case "toml":
                return yield import("refractor/lang/toml.js");
            case "trickle":
            case "troy":
            case "tremor":
                return yield import("refractor/lang/tremor.js");
            case "trig":
            case "turtle":
                return yield import("refractor/lang/turtle.js");
            case "twig":
                return yield import("refractor/lang/twig.js");
            case "ts":
            case "typescript":
                return yield import("refractor/lang/typescript.js");
            case "tsconfig":
            case "typoscript":
                return yield import("refractor/lang/typoscript.js");
            case "uscript":
            case "uc":
            case "unrealscript":
                return yield import("refractor/lang/unrealscript.js");
            case "uorazor":
                return yield import("refractor/lang/uorazor.js");
            case "url":
            case "uri":
                return yield import("refractor/lang/uri.js");
            case "v":
                return yield import("refractor/lang/v.js");
            case "vala":
                return yield import("refractor/lang/vala.js");
            case "vbnet":
                return yield import("refractor/lang/vbnet.js");
            case "velocity":
                return yield import("refractor/lang/velocity.js");
            case "verilog":
                return yield import("refractor/lang/verilog.js");
            case "vhdl":
                return yield import("refractor/lang/vhdl.js");
            case "vim":
                return yield import("refractor/lang/vim.js");
            case "vb":
            case "vba":
            case "visual-basic":
                return yield import("refractor/lang/visual-basic.js");
            case "warpscript":
                return yield import("refractor/lang/warpscript.js");
            case "wasm":
                return yield import("refractor/lang/wasm.js");
            case "webidl":
            case "web-idl":
                return yield import("refractor/lang/web-idl.js");
            case "wgsl":
                return yield import("refractor/lang/wgsl.js");
            case "wiki":
                return yield import("refractor/lang/wiki.js");
            case "mathematica":
            case "nb":
            case "wl":
            case "wolfram":
                return yield import("refractor/lang/wolfram.js");
            case "wren":
                return yield import("refractor/lang/wren.js");
            case "xeoracube":
            case "xeora":
                return yield import("refractor/lang/xeora.js");
            case "xml-doc":
                return yield import("refractor/lang/xml-doc.js");
            case "xojo":
                return yield import("refractor/lang/xojo.js");
            case "xquery":
                return yield import("refractor/lang/xquery.js");
            case "yml":
            case "yaml":
                return yield import("refractor/lang/yaml.js");
            case "yang":
                return yield import("refractor/lang/yang.js");
            case "zig":
                return yield import("refractor/lang/zig.js");
        }
    });
}
