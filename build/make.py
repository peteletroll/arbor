#!/usr/bin/env python
# encoding: utf-8
"""
build.py

regenerates the files in lib/ based on the current state of src/

Created by Christian Swinehart on 2010-12-05.
Copyright (c) 2010 Samizdat Drafting Co. All rights reserved.
"""

from __future__ import with_statement
import sys
import os
import re
from glob import glob
from subprocess import Popen, PIPE
from datetime import datetime
import shutil


# your system configuration may vary...
YUI_PATH = "uglifyjs"
YUI_OPTIONS = "--compress --mangle"








def make_lib():
  if not os.path.exists('lib'): os.mkdir('lib')
  targets = {
    "arbor.js": ["etc.js", "kernel.js", "physics/atoms.js", "physics/system.js", "physics/barnes-hut.js", "physics/physics.js" ],
    "arbor-tween.js": ["etc.js","graphics/colors.js", "tween/easing.js", "tween/tween.js"],
    "arbor-graphics.js": ["etc.js", "graphics/colors.js", "graphics/primitives.js", "graphics/graphics.js" ],
  }

  for target,deps in targets.items():
    print(target)

    padding = max(len(os.path.basename(fn)) for fn in deps + (['worker.js'] if 'kernel.js' in deps else []))

    all_src = dict( (fn, compile("src/%s"%fn,fn,padding)) for fn in deps)
    deps_code = "\n".join(all_src[fn] for fn in deps)

    worker, worker_deps = make_worker(deps, padding)
    output_code = render_file(target, deps=deps_code, worker=worker, worker_deps=worker_deps)
    with open("lib/%s"%target,"wb") as f:
      f.write(output_code.encode("utf-8"))
    print("")

def make_worker(deps, padding):
  if 'kernel.js' not in deps: return "",""

  workerfile = "src/physics/worker.js"
  driver = open(workerfile, "rb").read().decode("utf-8").strip()

  # strip out aliases
  m=re.search(r'^(.*)//.alias.*endalias.*?\n(.*)', driver, re.S)
  if m: driver = m.group(1)+m.group(2)

  driver = re.sub(r'importScripts\(.*?\).*?\n','', driver)
  worker_code = compile(driver, 'worker.js', padding)
  
  return worker_code, ""
      
def render_file(target, **_vals):

  def tmpl_render(tmpl, **args):
    lines = tmpl.split("\n")
    for var,val in args.items():
      tag_re = re.compile(r"^([\t ]*?)\{\{%s\}\}"%var)
      output = []
      for line in lines:
        m = tag_re.search(line)
        if m:
          ws = m.group(1)
          padded_replacement = ws + val.replace("\n","\n"+ws)
          output.append(padded_replacement)
        else:
          output.append(line)
      lines = output
    return "\n".join(lines)

  wrapper_tmpl = open("build/tmpl/%s"%target, "rb").read().decode("utf-8")

  vals = dict( (k.upper(),v) for k,v in _vals.items())
  dep_src = vals['DEPS']
  worker_src = vals['WORKER']
  license_txt = open('build/tmpl/LICENSE', "rb").read().decode("utf-8").replace('{{YEAR}}',str(datetime.now().year))
  if 'graphics' in target or 'tween' in target:
    vals['LICENSE'] = "\n".join([ln for ln in license_txt.split("\n") if 'springy.js' not in ln])
  else:
    vals['LICENSE'] = license_txt
  return tmpl_render(wrapper_tmpl, **vals)

def compile(js, title=None, padding=10):
  # for those last-minute s///g details...
  def filter_src(src, name):
    if 'kernel' in name:
      src = re.sub(r'new Worker\((.*)[\'\"](.*)/worker.*?\)', 
                  r'new Worker(\1"arbor.js")', 
                  src)
    return src


  # if we don't have a cached copy of the compiler output for the file, 
  # run yui and save the raw output to the .o directory for later. otherwise
  # just return the text from the cached file.
  yui_cmd = "%s %s" % (YUI_PATH,YUI_OPTIONS)
  if os.path.exists(js): 
    yui_input = open(js, "rb").read().decode("utf-8")
    title = os.path.basename(js)
  else: 
    yui_input = js
  yui_input = filter_src(yui_input, title)

  if True:
    print("+ "+title.replace('.js',''))
    p = Popen(yui_cmd, shell=True, stdin=PIPE, stdout=PIPE, close_fds=True)
    (pin, pout) = (p.stdin, p.stdout)
    pin.write(yui_input.encode("utf-8"))
    yui_output=p.communicate()[0].strip()
    if not yui_output:
      print("Compilation failed (%s)"%title)
      sys.exit(1)



  
  if title:
    return "/* %s%s */  %s"%(" "*(padding-len(title)),title,yui_output)
  else:
    return yui_output
  

def main():
  os.chdir("%s/.."%os.path.dirname(os.path.abspath(__file__)))
  make_lib()


if __name__ == '__main__':
  main()




