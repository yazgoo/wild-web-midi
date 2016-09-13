document.getElementById("midi_player").innerHTML = `<div class="spinner" id='spinner'></div>
<div class="emscripten" id="status">Downloading...</div>
<div class="emscripten">
<progress value="0" max="100" id="progress" hidden=1></progress>
</div>
<br/>

<span>



<span id="playerbar">
<div id="playerprogress"></div>
</span>

<span id="playingtime">0:00</span>

<span id="totaltime">0:00</span>

</span>
<br/>

<div>
<input id="stop" type="button" onclick="stop()" value="Stop"></input>

<label><input type="checkbox" id="waveconversion" /> Run WAV Converter (instead of web audio playback)</label>
</div>

<div>
<button onclick="openFile()" id="drop_zone">Open Midi! (or Drag Files here)</button>

<i>or</i> <select id="playlist">
<option value="">Select a song</option>
</select>


</div>
<br/>

<!--
&#x2B24; #8226
<i>Samples (<a href="https://archive.org/details/GravisUltrasoundMidiFiles">source</a>)</i>
&#x25CF; <a href="#" onclick="return convertMidi('TOCATTA.MID');">Tocatta (2:14)</a>
&#x25CF; <a href="#" onclick="return convertMidi('ENTERTNR.MID');">Entertainer (1:32)</a>
&#x25CF; <a href="#" onclick="return convertMidi('STRIVING.MID');">Striving (4:17)</a>
<br/>
<i>Super Mario Bros (<a href="http://www.gamemusicthemes.com/sheetmusic/nintendo/supermariobros/overworldtheme/">source</a>)</i>
&#x25CF; <a href="#" onclick="return convertMidi('Super_Mario_Bros_-_Overworld_Theme_by_BlueSCD.mid');">Overworld Theme (1:30)</a>

<br/>

<i>Final Fantasy 9 (<a href="http://www.midishrine.com/index.php?id=87">source</a>)</i>
&#x25CF; <a href="#" onclick="return convertMidi('prelude.mid');">Prelude (4:29)</a>
&#x25CF; <a href="#" onclick="return convertMidi('melodies_of_life.mid');">Melodies of life (7:32)</a>
</div>
-->

<div id="completed"></div>`
var statusElement = document.getElementById('status');
var progressElement = document.getElementById('progress');
var spinnerElement = document.getElementById('spinner');
var completedElement = document.getElementById('completed');
var waveConversion = document.getElementById('waveconversion');

var playerbar = document.getElementById('playerbar');
var playerprogress = document.getElementById('playerprogress');
var playingtime = document.getElementById('playingtime');
var totaltime = document.getElementById('totaltime');
var playlist = document.getElementById('playlist');

var SONGS = {
  'Debussy - Clair de lune': 'deb_clai.mid',
  'Final Fantasy 3 - Chocobo': 'ff3chocobo.mid',
  'Chopin - Etude Op.10 No.4': 'etude_10_4_(c)finley.mid',
  'Chopin - Fantasy Impromptu': 'chpn_op66.mid',
  'Lizst - Etude No. 3 "La Campanella"': 'liz_et3.mid',
  'Tocatta': 'TOCATTA.MID',
  'Entertainer': 'ENTERTNR.MID',
  'Striving': 'STRIVING.MID',
  'Super Mario Bros Overworld Theme': 'Super_Mario_Bros_-_Overworld_Theme_by_BlueSCD.mid',
  'Final Fantasy 9 - Prelude': 'prelude.mid',
  'Final Fantasy 9 - Melodies of life': 'melodies_of_life.mid'
};

for (var s in SONGS) {
  var option = document.createElement('option');
  option.innerHTML = s;
  option.value = SONGS[s];
  playlist.appendChild(option);
}

playlist.onchange = function() {
  if (this.value) convertMidi(this.value);
}


var input;
var webAudioMode;

var midiName = ''
var convertionJob = null;

function processAudio(buffer_loc, size) {
  buffer = circularBuffer.prepare();
  var left_buffer_f32 = buffer.getChannelData(0);
  var right_buffer_f32 = buffer.getChannelData(1);

  // Copy emscripten memory (OpenAL stereo16 format) to JS
  for (var i = 0; i < size; i++) {
    left_buffer_f32[i] = Module.HEAP16[(buffer_loc >> 1) + 2 * i + 0] / 32768;
    right_buffer_f32[i] = Module.HEAP16[(buffer_loc >> 1) + 2 * i + 1] / 32768;
  }
}

var ULONG_MAX = 4294967295;
var
currentSamples = 0,
               totalSamples = 0,
               seekSamples = ULONG_MAX,
               pauseAudioAfterDrainingBuffer = false,
               signalStop = 0,
               callbackOnStop = null
               ;

               playerbar.addEventListener('mousedown', function(e) {
                 var percent = e.offsetX / 500;
                 seekSamples = percent * totalSamples | 0;

                 if (webAudioMode && !convertionJob) {
                   convertMidi(midiName)
                 }
               });

function stop() {
  circularBuffer.reset();
  signalStop = 1;
}

function updateProgress(current, total) {
  currentSamples = current;
  totalSamples = total;
  playerprogress.style.width = (current / total * 100) + '%';
  playingtime.innerHTML = samplesToTime(current);
  totaltime.innerHTML = samplesToTime(total);
  // console.log('t', current, total);
}

function samplesToTime(at) {
  var in_s = Math.ceil(at / SAMPLE_RATE);
  var s = in_s % 60;
  var min = in_s / 60 | 0;
  return min + ':' + (s === 0 ? '00' : s < 10 ? '0' + s : s);

}

function convertMidi(name) {
  midiName = name;
  convert();
  return false;
}

// File Open code adapted from "mrdoobapproves" project
function openFile() {
  openAs(document.body);
}

function onFileOpen(file, data) {
  midiName = file.name;
  console.log('open ', midiName);
  FS.writeFile('/freepats/' + midiName, data, { encoding: 'binary' });
  convert();
}

//   function handleFileSelect(evt) {
//   evt.stopPropagation();
//   evt.preventDefault();
//   var files = evt.dataTransfer.files; // FileList object.

//   // files is a FileList of File objects. List some properties.
//   var output = [];
//   for (var i = 0, f; f = files[i]; i++) {
//     output.push('<li><strong>', escape(f.name), '</strong> (', f.type || 'n/a', ') - ',
//                 f.size, ' bytes, last modified: ',
//                 f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a',
//                 '</li>');
//   }
//   document.getElementById('list').innerHTML = '<ul>' + output.join('') + '</ul>';
// }

function handleFileSelect(evt) {
  console.log('handleFileSelect', evt)
    evt.stopPropagation();
  evt.preventDefault();
  var files = evt.dataTransfer ? evt.dataTransfer.files : evt.target.files;
  // var files = evt.target.files; // FileList object
  var f = files[ 0 ]; // TODO: handle multiple midi files in future
  if (!f) return;

  if (!f.type.match(/audio\/mid/)) {
    console.log('Warning: ' + f.type + ' does not seem to be a midi file');
  }

  var reader = new FileReader();

  // Closure to capture the file information.
  reader.onload = function(e) {
    var arrayBuffer = e.target.result;
    var byteArray = new Uint8Array(arrayBuffer);
    onFileOpen(f, byteArray);
  };
  reader.readAsArrayBuffer(f);
  if (input) input.value = '';
}

function openAs(target) {
  if (!input) {
    input = document.createElement('input');
    input.style.display = 'none';
    input.type = 'file';
    input.addEventListener('change', handleFileSelect);
    target = target || document.body;
    target.appendChild(input);
  }

  var e = document.createEvent('MouseEvents');
  e.initMouseEvent(
      'click', true, false, window, 0, 0, 0, 0, 0,
      false, false, false, false, 0, null
      );

  input.dispatchEvent(e);
}

function convert() {
  webAudioMode = !waveConversion.checked;

  if (webAudioMode && convertionJob) {
    stop();
    callbackOnStop = convert;
    return;
  }

  if (convertionJob) {
    console.log('current midi is running...');
    Module.setStatus('Current job still running...');
    return;
  }

  spinnerElement.style.display = 'inline-block';

  Module.setStatus(webAudioMode ?
      'Playing':
      'Converting...');

  // add small delay so UI can update.
  setTimeout(runConversion, 200);
}

function runConversion() {
  convertionJob = {
    sourceMidi: 'freepats/' + midiName,
    targetWav: midiName.replace(/\.midi?$/i, '.wav'),
    targetPath: this.sourceMidi + '.wav',
    conversion_start: Date.now()
  };

  var sleep = -1; // use -1 for a blocking loop which is the fastest actually.
  if (webAudioMode) {
    convertionJob.targetPath = '';
    sleep = 10;
    circularBuffer.reset();
    setTimeout(startAudio, 100);
  }

  var method = 'async';
  switch (method) {
    case 'synchronous':
      wildwebmidi(sourceMidi, targetPath);
      break;
    case 'worker':
      worker.postMessage({
        type: 'convert',
        content: [sourceMidi, targetPath]
      });
      break;
    case 'async':
      Module.ccall('wildwebmidi',
          null,
          ['string', 'string', 'number'],
          [convertionJob.sourceMidi, convertionJob.targetPath, sleep],
          { async: true }
          );
      break;
  }
}

function completeConversion(status) {
  pauseAudioAfterDrainingBuffer = true;
  console.log('complete conversion', status)
    var conversion_time = Date.now() - convertionJob.conversion_start;
  // console.timeEnd('conversion');

  Module.setStatus('');

  if (convertionJob.targetPath) {
    var wave = FS.readFile(convertionJob.targetPath);
    FS.unlink(convertionJob.targetPath); // clean memeory!!

    var blob = new Blob( [ wave ], { type: 'audio/wave' } );
    var objectURL = URL.createObjectURL( blob );

    var audio = document.createElement('audio');
    audio.src = objectURL;
    audio.controls = true;
    audio.autoplay = true;

    completedElement.appendChild(audio);
    completedElement.appendChild(document.createTextNode(' Took ' + (conversion_time / 1000 | 0) + 's. '));

    var link = document.createElement('a');
    link.innerHTML = 'Download ' + convertionJob.targetWav;
    link.href = objectURL;
    link.download = convertionJob.targetWav;
    link.target = '_blank';

    completedElement.appendChild(link);

    completedElement.appendChild(document.createElement('br'));
  }

  convertionJob = null;

}

var Module = {
  // arguments: '-c /freepats/freepats.cfg -o /freepats/hoho.wav /freepats/alb_se5.mid'.split(' '),
  noInitialRun: true,
  // noExitRuntime: true,
  preRun: [],
  postRun: [],
  print: (function() {
    return function(text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      console.log(text);
    };
  })(),
  printErr: function(text) {
    if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
    if (0) { // XXX disabled for safety typeof dump == 'function') {
      dump(text + '\n'); // fast, straight to the real console
    } else {
      console.error(text);
    }
    },
      setStatus: function(text) {
        if (!Module.setStatus.last) Module.setStatus.last = { time: Date.now(), text: '' };
        if (text === Module.setStatus.text) return;
        var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
            var now = Date.now();
            if (m && now - Date.now() < 30) return; // if this is a progress update, skip it if too soon
            if (m) {
              text = m[1];
              progressElement.value = parseInt(m[2])*100;
              progressElement.max = parseInt(m[4])*100;
              progressElement.hidden = false;
              spinnerElement.hidden = false;
            } else {
              progressElement.value = null;
              progressElement.max = null;
              progressElement.hidden = true;
              if (!text) spinnerElement.style.display = 'none';
            }
            statusElement.innerHTML = text;
            },
            totalDependencies: 0,
            monitorRunDependencies: function(left) {
              this.totalDependencies = Math.max(this.totalDependencies, left);
              Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'Just downloading midi patches now.');
                  }
                  };
                  Module.setStatus('Downloading...');
                  window.onerror = function(event) {
                    // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
                    Module.setStatus('Exception thrown, see JavaScript console');
                    spinnerElement.style.display = 'none';
                    Module.setStatus = function(text) {
                      if (text) Module.printErr('[post-exception status] ' + text);
                    };
                  };


                  function handleDragOver(evt) {
                    evt.stopPropagation();
                    evt.preventDefault();
                    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
                  }

                  this.play = function(data) {
                    midiName = 'in'
                      var raw = atob(data)
                      var array = new Uint8Array(new ArrayBuffer(raw.length))
                      for(i = 0; i < raw.length; i++) {
                        array[i] = raw.charCodeAt(i);
                      }
                    console.log('open ', midiName);
                    FS.writeFile('/freepats/' + midiName, array, { encoding: 'binary' });
                    convert();
                  }

                  // Setup the dnd listeners.
                  var dropZone = document.getElementById('drop_zone');
                  dropZone.addEventListener('dragover', handleDragOver, false);
                  dropZone.addEventListener('drop', handleFileSelect, false);
