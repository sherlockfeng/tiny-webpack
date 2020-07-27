const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const babel = require('@babel/core');

const getModuleInfo = file => {
    // 获取ast
    const content = fs.readFileSync(file, 'utf-8');
    const ast = parser.parse(content, {sourceType: 'module'});

    // 收集引用
    const deps = {};
    traverse(ast, {
        ImportDeclaration({node}) {
            const dirname = path.dirname(file);
            const abspath = `./${path.join(dirname, node.source.value)}`;
            deps[node.source.value] = abspath;
        }
    });

    const {code} = babel.transformFromAst(ast, null, {
        presets: ['@babel/preset-env']
    });

    fs.writeFileSync('./src/trans.js', code);

    return {file, deps, code};
};

const parseModules = file => {
    const entry = getModuleInfo(file);
    const temp = [entry];
    for (let i = 0; i < temp.length; i++) {
        const deps = temp[i].deps;
        if (deps) {
            for (const key in deps) {
                if (deps.hasOwnProperty(key)) {
                    temp.push(getModuleInfo(deps[key]));
                }
            }
        }
    }
    const depsGraph = {};
    temp.forEach(({file, deps, code}) => {
        depsGraph[file] = {deps, code};
    });
    return depsGraph;
};

const bundle = file => {
    const depsGraph = parseModules(file);
    const depsGraphString = JSON.stringify(parseModules(file));

    (function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath]);
            }
            var exports = {};
            (function (require, exports, code) {
                eval(code);
            })(absRequire, exports, graph[file].code);
            return exports;
        }
        require(file);
    })(depsGraph);

    return `(function (graph) {
        function require(file) {
            function absRequire(relPath) {
                return require(graph[file].deps[relPath])
            }
            var exports = {};
            (function (require,exports,code) {
                eval(code)
            })(absRequire,exports,graph[file].code);
            return exports
        }
        require('${file}')
    })(${depsGraphString})`;
};

const constent = bundle('./src/index.js');

if (!fs.existsSync('./dist')) {
    fs.mkdirSync('./dist');
}

fs.writeFileSync('./dist/bundle.js', constent);
