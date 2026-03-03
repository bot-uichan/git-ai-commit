{
  description = "git-ai-commit (Codex-powered commit message CLI)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        packages = {
          git-ai-commit = pkgs.stdenvNoCC.mkDerivation {
            pname = "git-ai-commit";
            version = "0.1.1";
            src = ./.;

            nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper ];

            buildPhase = ''
              runHook preBuild
              export HOME=$TMPDIR
              bun install --frozen-lockfile
              bun run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out/lib/git-ai-commit $out/bin
              cp -R dist node_modules package.json bun.lock $out/lib/git-ai-commit/

              makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/git-ai-commit \
                --set NODE_PATH "$out/lib/git-ai-commit/node_modules" \
                --prefix PATH : "$out/lib/git-ai-commit/node_modules/.bin" \
                --add-flags "$out/lib/git-ai-commit/dist/cli.js"
              runHook postInstall
            '';
          };

          default = self.packages.${system}.git-ai-commit;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [ bun nodejs_22 git ];
        };
      });
}
