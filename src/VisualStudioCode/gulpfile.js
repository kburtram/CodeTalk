var gulp = require('gulp');
var rename = require('gulp-rename');
var gulpTsLint = require('gulp-tslint');
var ts = require('gulp-typescript');
var tslint = require('tslint');
var tsProject = ts.createProject('tsconfig.json');
var del = require('del');
var srcmap = require('gulp-sourcemaps');
var config = require('./tasks/config');
var concat = require('gulp-concat');
var minifier = require('gulp-uglify/minifier');
var uglifyjs = require('uglify-js');
var argv = require('yargs').argv;
var min = (argv.min === undefined) ? false : true;
var vscodeTest = require('vscode-test');
var packageJson = require('./package.json');

gulp.task('ext:lint', () => {
    // !! If updating this make sure to check if you need to update the TSA Scan task in ADO !!
    var program = tslint.Linter.createProgram('tsconfig.json');
    return gulp.src([
        config.paths.project.root + '/src/**/*.ts',
        config.paths.project.root + '/test/**/*.ts'
    ])
    .pipe((gulpTsLint({
        program,
        formatter: "verbose",
        rulesDirectory: "node_modules/tslint-microsoft-contrib"
    })))
    .pipe(gulpTsLint.report());
});


// Compile source
gulp.task('ext:compile-src', (done) => {
    return gulp.src([
                config.paths.project.root + '/src/**/*.ts',
                config.paths.project.root + '/src/**/*.js',
                '!' + config.paths.project.root + '/typings/**/*.ts'])
                .pipe(srcmap.init())
                .pipe(tsProject())
                .on('error', function() {
                    if (process.env.BUILDMACHINE) {
                        done('Extension Tests failed to build. See Above.');
                        process.exit(1);
                    }
                })
                //.pipe(nls.rewriteLocalizeCalls())
                //.pipe(nls.createAdditionalLanguageFiles(nls.coreLanguages, config.paths.project.root + '/localization/i18n', undefined, false))
                .pipe(srcmap.write('.', {
                   sourceRoot: function(file){ return file.cwd + '/src'; }
                }))
                .pipe(gulp.dest('out/src/'));
});

gulp.task('ext:compile', gulp.series('ext:compile-src'));

gulp.task('ext:copy-js', () => {
    return gulp.src([
            config.paths.project.root + '/src/**/*.js'])
        .pipe(gulp.dest(config.paths.project.root + '/out/src'))
});

gulp.task('ext:copy-assets', () => {
    return gulp.src([
            config.paths.project.root + '/src/assets/**/*'])
        .pipe(gulp.dest(config.paths.project.root + '/out/src/assets'))
});

// Copy the files which aren't used in compilation
gulp.task('ext:copy', gulp.series('ext:copy-js', 'ext:copy-assets'));

gulp.task('ext:build', gulp.series('ext:copy', 'ext:compile')); // removed lint before copy

gulp.task('clean', function (done) {
    return del('out', done);
});

gulp.task('compile', gulp.series('clean', 'ext:build'));

gulp.task('watch', function(){
    return gulp.watch(config.paths.project.root + '/src/**/*', gulp.series('compile'))
});

gulp.task('lint', gulp.series('ext:lint'));
