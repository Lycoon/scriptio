<template>
  <button class="button tab tab-text">Scene</button>
</template>

<style scoped>
.tab-text {
  font-size: 110%;
}

.tab {
  border: none;
  box-shadow: 5px;
  border-radius: 10px;
  width: 100%;
  box-shadow: 0px 0px 2px 0px rgba(192, 198, 198, 0.75);
}

.tab:hover {
  transition: transform 0.1s;
  transform: scale(1.03);
  box-shadow: 0px 0px 12px -1px #c0c6c6;
}

.tab:focus {
  transition: transform 0.1s;
  transform: scale(1.03);
  box-shadow: 0px 0px 12px -1px #c0c6c6;
}
</style>