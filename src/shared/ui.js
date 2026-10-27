import {S} from './state.js';
import {$} from '../browser/dom.js';

// 화면과 편집 취소는 진입점에서 주입한다. 역할별 구현을 역으로 import하지 않는다.
function createUI({vLogin,vHome,vWizard,vResult,vForm,vAdmin,vCns,vClogin,vCdash,abortEdit}){
function render(){
  const y=window.scrollY;
  $('#m-p').classList.toggle('on',S.mode==='participant');$('#m-c').classList.toggle('on',S.mode==='counselor');$('#m-m').classList.toggle('on',S.mode==='client');$('#m-a').classList.toggle('on',S.mode==='admin');
  const V={login:vLogin,home:vHome,wizard:vWizard,result:vResult,form:vForm,admin:vAdmin,cns:vCns,clogin:vClogin,cdash:vCdash};
  $('#app').innerHTML=V[S.view]();
  window.scrollTo(0,y);
}
function nav(v){S.view=v;S.err='';render();window.scrollTo(0,0)}
function setMode(m){if(S.cedit)abortEdit();S.mode=m;S.f.company='전체';S.f.page=1;S.f.st='전체';S.f.q='';S.created=[];S.bulk='';S.berr='';S.view=m==='counselor'?'cns':m==='admin'?'admin':m==='client'?(S.mgr?'cdash':'clogin'):(S.user?'home':'login');render();window.scrollTo(0,0)}
function goHome(){nav(S.mode==='counselor'?'cns':S.mode==='admin'?'admin':S.mode==='client'?(S.mgr?'cdash':'clogin'):(S.user?'home':'login'))}
return {render,nav,setMode,goHome};
}

export {createUI};
