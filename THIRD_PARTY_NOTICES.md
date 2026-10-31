# Third-party notices

The application source is MIT licensed; see [LICENSE](LICENSE).

The bootstrap script downloads official Node.js 24.22.2 for macOS from nodejs.org. Node includes its own license and third-party notices; setup copies the full upstream LICENSE to `runtime/NODE-LICENSE` and installs that file alongside the runtime. Do not omit it from any binary distribution. Upstream: https://github.com/nodejs/node and https://nodejs.org/dist/v24.22.2/.

Google Chrome is installed separately by the user and is not redistributed in this repository. Google Meet and Google APIs remain subject to their provider's terms and account policies. Apple frameworks and command-line tools are supplied by macOS/Xcode, not this repository.

There are no npm package dependencies. The repository does not import code from adjacent meeting-bot projects. Future dependencies and packaged native frameworks must add their applicable notices here.
