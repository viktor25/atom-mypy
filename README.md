# atom-mypy


## Features

 - Lint as you type
 - Support for mypy's experimental incremental mode for faster type checking
 - Per-project configuration with `mypy.ini`
 - Support for including stubs inside the project (relative `MYPYPATH`)


![Screenshot](screenshot.png?raw=true)


## Requirements

You need to have mypy version 0.501 or newer. By default atom-mypy will run `python3 -m mypy`, this is configurable.

If you don't already have the [linter](https://atom.io/packages/linter) package, you will be prompted to install it once you install atom-mypy.


## Configuration

mypy looks for configuration in three places: the [command line](http://mypy.readthedocs.io/en/latest/command_line.html), the `MYPYPATH` environment variable, and the `mypy.ini` (or `setup.cfg`) [config file](http://mypy.readthedocs.io/en/latest/config_file.html).

You can edit the command line in atom-mypy's settings - e.g. change `python3 -m mypy` to `python3 -m mypy --follow-imports skip`. However, in most cases the mypy config file is a better way to specify mypy configuration, because it allows different configuration per project. Options given via the command line take precedence over options given in the config file.

You can configure the `MYPYPATH` environment variable in atom-mypy's settings, or you can specify `mypy_path` in the config file; the environment variable takes precedence. In general, use `MYPYPATH` for stubs that should be available to all of your projects, and use `mypy_path` with a relative path for stubs included inside a project.

atom-mypy will look for a `mypy.ini` or `setup.cfg` config file and execute mypy from the directory of that file. This allows you to keep your mypy configuration inside your project. In most cases using the config file is the correct way to configure mypy.


## Lint as you type

Enabled by default. If enabled, atom-mypy will lint whenever you stop typing. If not enabled, atom-mypy will lint whenever you save the file.

It needs to be enabled in the settings of both atom-mypy and linter. You can change the typing detection delay in the settings of linter.


## Incremental mode

Disabled by default. Experimental. When enabled, mypy caches results from previous runs to speed up type checking.

By default the cache will be stored in your operating system's temporary directory. You can change the cache directory, or specify a relative path to keep the cache inside each project.
