#!/usr/bin/env bash

rm -rf build
mkdir -p build

cp *.html build
cp *.css build
cp -r fonts build

# https://vaneyckt.io/posts/safer_bash_scripts_with_set_euxo_pipefail/
# set -euxo pipefail

# rm -rf build/
# cp -r public/ build/

# if command -v roc &>/dev/null; then
#     roc='roc'
# else
#     echo "roc is not on the PATH; downloading latest nightly..."
#     # get roc release archive
#     curl -fOL https://github.com/roc-lang/roc/releases/download/nightly/roc_nightly-linux_x86_64-latest.tar.gz
#     # extract archive
#     ls | grep "roc_nightly" | xargs tar -xzvf
#     # delete archive
#     ls | grep "roc_nightly.*tar.gz" | xargs rm
#     # simplify dir name
#     mv roc_nightly* roc_nightly

#     roc='./roc_nightly/roc'
# fi

# $roc version

# echo 'Building site markdown content'
# $roc run roc/main.roc -- roc/content/ roc/build/

# # cleanup
# rm -rf roc_nightly roc_releases.json
