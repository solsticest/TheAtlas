'use strict';
// Pure geometry shared by the editor and regression checks. Coordinates point up.
const AtlasMath = {
  routeLength(points){
    return points.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):0,0);
  },
  alignTwoPoints(source,target,width,height){
    const [a,b]=source,[c,d]=target;
    if(![a,b,c,d].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error('Нужны две пары ориентиров.');
    const sx=b.x-a.x,sy=b.y-a.y,tx=d.x-c.x,ty=d.y-c.y;
    const sl=Math.hypot(sx,sy),tl=Math.hypot(tx,ty);
    if(sl<1e-6||tl<1e-6)throw Error('Ориентиры должны быть разными точками.');
    if(!(width>0&&height>0))throw Error('Неизвестны размеры изображения.');
    const scale=tl/sl,angle=Math.atan2(ty,tx)-Math.atan2(sy,sx),cos=Math.cos(angle),sin=Math.sin(angle);
    const dx=width/2-a.x,dy=height/2-a.y;
    const cx=c.x+scale*(dx*cos-dy*sin),cy=c.y+scale*(dx*sin+dy*cos);
    return {bounds:{x1:cx-width*scale/2,y1:cy-height*scale/2,x2:cx+width*scale/2,y2:cy+height*scale/2},rotation:((-angle*180/Math.PI)%360+360)%360,scale};
  }
};
if(typeof module!=='undefined')module.exports=AtlasMath;
