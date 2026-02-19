# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan : Refonte du Scoring + Bouton Recalculer

## Contexte

Le système de scoring actuel présente deux problèmes :

1. **Non-monotone** : après une remédiation (35 → 21 issues), le score est passé de 7.9 à 6.8 — une **régression**. La cause : la donnée `totalLOC` est 0 dans l'évaluation après remédiation (bug de collecte), ce qui fait chuter le tier de `large` (allowance=15) à `small` (allowance=5), rendant la pénalité soudainement sévère mê...

