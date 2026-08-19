# Migrations legadas (nao executaveis)

Estes arquivos foram preservados apenas para auditoria do historico. Eles nao
formam uma cadeia capaz de criar um banco vazio: a primeira migration ja tenta
alterar `vehicles`, e outras dependem de tabelas que nunca sao criadas pelo
conjunto versionado.

O glob do TypeORM carrega somente arquivos diretamente em `src/migrations`,
portanto nada deste diretorio deve ser movido de volta para a raiz. O schema
compartilhado passa a usar `CanonicalSharedSchema` como baseline consolidada e
migrations futuras devem ser append-only.
