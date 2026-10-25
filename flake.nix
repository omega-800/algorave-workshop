{
  description = "nodejs development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, self }:
    let
      systems = nixpkgs.lib.platforms.unix;
      eachSystem =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f (
            import nixpkgs {
              inherit system;
              config = { };
              overlays = [ ];
            }
          )
        );
      tidalRun = pkgs: pkgs.writeShellApplication {
        name = "tidal-run";
        runtimeInputs = [ pkgs.tidal-cycles-full ];
        text = ''
          file="''${1:?usage: tidal-run <file.tidal>}"
          [[ -e "$file" ]] || { echo "error: $file not found" >&2; exit 1; }
          if [[ -t 0 ]]; then
            # Interactive terminal (or a live deck slide): keep the REPL open
            # so the pattern keeps playing until you stop it.
            exec tidal-cycles -ghci-script "$file"
          fi
          # Non-interactive (PDF/HTML export, pipes): evaluate the file then quit.
          script="$(mktemp)"
          cat "$file" > "$script"
          printf ':quit\n' >> "$script"
          trap 'rm -f "$script"' EXIT
          exec tidal-cycles -ghci-script "$script"
        '';
      };
    in
    {
      devShells = eachSystem (pkgs: {
        default = pkgs.mkShellNoCC {
          packages = with pkgs; [
            nodejs_22
            alsa-lib
            git
            presenterm
            qrencode

            self.packages.${pkgs.stdenv.hostPlatform.system}.presentation
            self.packages.${pkgs.stdenv.hostPlatform.system}.strudel-play

            supercollider
            supercolliderPlugins.sc3-plugins

            tidal-cycles-full
            (tidalRun pkgs)
          ];
          env = {
            LD_LIBRARY_PATH = "$LD_LIBRARY_PATH:${pkgs.lib.makeLibraryPath [
              pkgs.alsa-lib
              pkgs.pipewire.jack
            ]}";
          };
        };
      });

      packages = eachSystem (
        pkgs:
        let
          presenterm = pkgs.lib.getExe pkgs.presenterm;
          fs = pkgs.lib.fileset;
          root = ./.;

          strudel-play = derivation {
            inherit (pkgs.stdenv.hostPlatform) system;
            name = "strudel-play";
            src = ./tools/strudel-play.mjs;
            builder = "${pkgs.bash}/bin/bash";
            args = [
              "-c"
              ''${pkgs.coreutils}/bin/mkdir -p $out/bin $out/libexec &&
              ${pkgs.coreutils}/bin/install -Dm 755 $src $out/libexec/strudel-play.mjs &&
              printf '%s\n' \
                '#!/bin/sh' \
                'dir=$(dirname "$0")' \
                'exec "${pkgs.nodejs_22}/bin/node" "$dir/../libexec/strudel-play.mjs" "$@"' \
                > $out/bin/strudel-play &&
              ${pkgs.coreutils}/bin/chmod +x $out/bin/strudel-play''
            ];
          };

          presentation = pkgs.writeShellApplication {
            name = "presentation";
            runtimeInputs = [ pkgs.qrencode strudel-play (tidalRun pkgs) ];
            text = ''
              export LD_LIBRARY_PATH="''${LD_LIBRARY_PATH:+$LD_LIBRARY_PATH:}${pkgs.lib.makeLibraryPath [ pkgs.alsa-lib ]}"
              export STRUDEL_SERVER="$PWD/tools/nvim-strudel/server/dist/index.js"
              export STRUDEL_LOG_DIR="$PWD/logs"
              ${presenterm} -c ./presentation/config.yaml ./presentation/presentation.md
            '';
          };

          presentation-pdf = derivation {
            inherit (pkgs.stdenv.hostPlatform) system;
            name = "presentation-pdf";
            builder = "${pkgs.bash}/bin/bash";
            src = fs.toSource {
              inherit root;
              fileset = fs.intersection (fs.gitTracked root) (
                fs.fileFilter (f: f.hasExt "md" || f.hasExt "yaml") ./presentation
              );
            };
            args = [
              "-c"
              ''${pkgs.coreutils}/bin/mkdir -p $out &&
              PATH="$PATH:${strudel-play}/bin:${pkgs.qrencode}/bin:${pkgs.python313Packages.weasyprint}/bin"
                ${presenterm} -c $src/presentation/config.yaml -e $src/presentation/presentation.md -o $out/presentation.pdf''
            ];
          };
        in
        {
          inherit presentation presentation-pdf strudel-play;
          default = presentation;
        }
      );

      apps = eachSystem (
        pkgs:
        pkgs.lib.mapAttrs (_: drv: {
          type = "app";
          program = "${drv}${drv.passthru.exePath or "/bin/${drv.pname or drv.name}"}";
        }) self.packages.${pkgs.stdenv.hostPlatform.system}
      );
    };
}
