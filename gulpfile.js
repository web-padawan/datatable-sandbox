'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var fs = require('fs');
var del = require('del');
var runSequence = require('run-sequence');
var merge = require('merge-stream');
var path = require('path');
var cp = require('child_process');
var browserSync = require('browser-sync');

var logger = require('plylog');
logger.setVerbose();

var DIST = 'dist';
var TMP = '.tmp';
var SHARDS = '.shards';
var SERVER = 'node_modules/local-web-server/bin/cli.js';

var serverConfig = require('./.local-web-server.json');

const polymer = require('polymer-build');
const polymerJSON = require('./polymer.json');
const project = new polymer.PolymerProject(polymerJSON);

const errorHandler = function (err) {
  // exit with a 'failure' code on build errors
  console.error(err.message);
  process.exit(1);
};

var dist = function(subpath) {
  return subpath ? path.join(DIST, subpath) : DIST;
};

// Clean output directory
gulp.task('clean', function() {
  return del(['.tmp', dist()]);
});

// Process index.html
gulp.task('index', function() {
  return gulp.src('src/index.html')
    .pipe($.useref())
    .pipe($.htmlmin({
      collapseWhitespace: true,
      removeComments: true
    }))
    .pipe($.crisper({
      scriptInHead: true
    }))
    .pipe($.replace('index.js', '/index.js'))
    .pipe(gulp.dest(dist()))
    .pipe($.size({
      title: 'index'
    }));
});

// Copy files to dist
gulp.task('copy', function() {
  // Copy favicon.ico
  var favicon = gulp.src('src/favicon.ico')
    .pipe(gulp.dest(dist()));

  var json = gulp.src('src/**.json')
    .pipe(gulp.dest(dist()));

  // Copy webcomponents.js
  var vendor = gulp.src('src/vendor/webcomponentsjs/webcomponents-lite.min.js')
    .pipe(gulp.dest(dist('vendor/webcomponentsjs')));

  return merge(vendor, favicon, json)
    .pipe($.size({
      title: 'copy'
    }));
});

// Copy fonts to dist
gulp.task('fonts', function() {
  return gulp.src('src/vendor/font-roboto/**/*.ttf')
    .pipe(gulp.dest(dist('vendor/font-roboto')))
    .pipe($.size({
      title: 'fonts'
    }));
});

// Copy and minify images
gulp.task('images', function() {
  return gulp.src('src/images/**/*')
    .pipe($.imagemin({
      progressive: true,
      interlaced: true
    }))
    .pipe(gulp.dest(dist('images')))
    .pipe($.size({title: 'images'}));
});

// Vulcanize elements
gulp.task('vulcanize', function() {
  return new Promise((resolve, reject) => {
    var buildStream = merge(project.sources(), project.dependencies())
      .pipe(project.bundler)
      .on('error', reject)
      .pipe(gulp.dest(SHARDS))
      .on('end', resolve);
  }).then(function () {
    console.log('bundle complete!');
  });
});

// Minify HTML and inline styles
gulp.task('minify:html', function() {
    return gulp.src([
      SHARDS + '/src/components/app/**/*-app.html',
      SHARDS + '/src/components/pages/**/*-{page,tab}.html'
    ], { base: SHARDS + '/src' })
    .pipe($.htmlmin({
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true
    }))
    .pipe($.replace(/(assetpath=".+)(\.\.\/vendor)(?=.+")/g, '$1vendor'))
    .pipe(gulp.dest(TMP))
    .pipe($.size({
      title: 'minify:html'
    }));
});

// Extract inline scripts
gulp.task('crisper', function() {
  return gulp.src(TMP + '/**/*.html')
    .pipe($.crisper({
      scriptInHead: false
    }))
    .pipe(gulp.dest(TMP))
    .pipe($.size({
      title: 'crisper'
    }));
});

// Minify JS
gulp.task('minify:js', function() {
  return gulp.src(TMP + '/**/*.js')
    .pipe($.uglify())
    .pipe(gulp.dest(TMP))
    .pipe($.size({
      title: 'minify:js'
    }));
});

// Move processed files to dist
gulp.task('finalize', function() {
  return gulp.src(TMP + '/{components,styles}/**/*.{html,js}')
    .pipe(gulp.dest(dist()))
    .pipe($.size({
      title: 'finalize'
    }));
});

// Production build pipeline
gulp.task('build', ['clean'], function(done) {
  runSequence(
    ['index', 'copy', 'fonts', 'images'],
    'vulcanize',
    'minify:html',
    'crisper',
    'minify:js',
    'finalize',
    function(err) {
      if (err) {
        console.error(err);
      }
      done();
    });
});

// Serve project from dist. No livereload used
gulp.task('serve:dist', function(done) {
  return cp.spawn('node', [SERVER, '--directory=dist'], {stdio: 'inherit'})
    .on('close', done);
});

// Serve project from src
gulp.task('serve', function(done) {
  return cp.spawn('node', [SERVER, '--directory=src'], {stdio: 'inherit'})
    .on('close', done);
});

// Reload on changes
gulp.task('reload', function() {
  browserSync.reload();
});

// Proxy requests to local-web-server
gulp.task('browser-sync', function() {
  var files = [
    'src/components/**/*',
    'src/styles/**/*'
  ];
  return browserSync.init(files, {
    proxy: '127.0.0.1:' + serverConfig.port,
    open: true,
    injectChanges: true,
    snippetOptions: {
      rule: {
        match: '<span id="browser-sync-binding"></span>',
        fn: function(snippet) {
          return snippet;
        }
      }
    }
  });
});

// Watch for changes and reload page
gulp.task('watch', function() {
  gulp.watch([
    'src/components/**/*',
    'src/styles/**/*'
  ], ['reload']);
});

gulp.task('default', ['browser-sync', 'serve', 'watch']);
