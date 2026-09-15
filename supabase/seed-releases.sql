-- Seed the releases table. Checksums are of the binaries built on 2026-09-15.
-- Upload THOSE files to the release first: a hash that does not match the
-- download makes REX refuse the update, which is the point of having it.
insert into public.releases (version, platform, arch, kind, url, size, sha256) values
  ('0.2.4', 'win32', 'x64', 'portable', 'https://github.com/rxdsec634/REX/releases/download/rex/REX.0.2.4.exe', 88588492, 'e870c9162b49a073010ac55dcc585097175691d0147a9728461aa77785681578'),
  ('0.2.4', 'win32', 'x64', 'installer', 'https://github.com/rxdsec634/REX/releases/download/rex/REX.Setup.0.2.4.exe', 88815443, '9e148ba4ce2196d8bd6ab583e3310dc53da016f8d3ccf54c1256eb00aed8028c'),
  ('0.2.4', 'linux', 'x64', 'tarball', 'https://github.com/rxdsec634/REX/releases/download/rex/rex-0.2.4-linux-x64.tar.gz', 119727990, '832c15d1e047e5bc5b1e1c81633851c06f045c5050b73035bd1607adf1def757'),
  ('0.2.4', 'linux', 'x64', 'deb', 'https://github.com/rxdsec634/REX/releases/download/rex/rex_0.2.4_amd64.deb', 119742764, '2848b05cfbbce1e09f9588f2987d321ed19207ab334712cced3bbe9a65161206');
