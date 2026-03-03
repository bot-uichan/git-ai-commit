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

            nativeBuildInputs = [ pkgs.bun ];

            buildPhase = ''
              runHook preBuild
              export HOME=$TMPDIR
              bun install
              bun run build:bun-bin
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              install -Dm755 bin/git-ai-commit $out/bin/git-ai-commit
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
