# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan : Refonte du Scoring + Bouton Recalculer

## Contexte

Le système de scoring actuel présente deux problèmes :

1. **Non-monotone** : après une remédiation (35 → 21 issues), le score est passé de 7.9 à 6.8 — une **régression**. La cause : la donnée `totalLOC` est 0 dans l'évaluation après remédiation (bug de collecte), ce qui fait chuter le tier de `large` (allowance=15) à `small` (allowance=5), rendant la pénalité soudainement sévère mê...

### Prompt 2

In this url: http://localhost:3000/evaluation/6e47bfce-57ce-48b6-912e-334e37d721de?tab=summary&debug=true - i don't see the button.

### Prompt 3

It only logs score but it's not updated in DB

### Prompt 4

commit

