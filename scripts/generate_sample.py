"""Generate our own ISO 10303-21 faceted B-rep fixture (millimetres, no downloads)."""
from pathlib import Path
from math import cos, sin, pi, sqrt

entities = []


def add(value):
    entities.append(value)
    return f"#{len(entities)}"


def refs(items):
    return '(' + ','.join(items) + ')'


def solid(name, vertices, faces, rgb):
    points = [add("CARTESIAN_POINT('',(%s))" % ','.join(f'{v:.6f}' for v in vertex)) for vertex in vertices]
    vertex_points = [add(f"VERTEX_POINT('',{point})") for point in points]
    edges = {}
    brep_faces = []
    for face in faces:
        oriented_edges = []
        for a, b in zip(face, face[1:] + face[:1]):
            key = tuple(sorted((a, b)))
            if key not in edges:
                start, end = key
                vector = [vertices[end][i] - vertices[start][i] for i in range(3)]
                length = sqrt(sum(v*v for v in vector))
                direction = add("DIRECTION('',(%s))" % ','.join(f'{v / length:.9f}' for v in vector))
                line_vector = add(f"VECTOR('',{direction},{length:.9f})")
                line = add(f"LINE('',{points[start]},{line_vector})")
                edges[key] = add(f"EDGE_CURVE('',{vertex_points[start]},{vertex_points[end]},{line},.T.)")
            sense = '.T.' if a == key[0] else '.F.'
            oriented_edges.append(add(f"ORIENTED_EDGE('',*,*,{edges[key]},{sense})"))
        loop = add(f"EDGE_LOOP('',{refs(oriented_edges)})")
        bound = add(f"FACE_OUTER_BOUND('',{loop},.T.)")
        a, b, c = (vertices[i] for i in face[:3])
        u = [b[i] - a[i] for i in range(3)]
        v = [c[i] - a[i] for i in range(3)]
        normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = sqrt(sum(x*x for x in normal))
        normal_direction = add("DIRECTION('',(%s))" % ','.join(f'{x / length:.9f}' for x in normal))
        u_length = sqrt(sum(x*x for x in u))
        reference = add("DIRECTION('',(%s))" % ','.join(f'{x / u_length:.9f}' for x in u))
        placement = add(f"AXIS2_PLACEMENT_3D('',{points[face[0]]},{normal_direction},{reference})")
        plane = add(f"PLANE('',{placement})")
        brep_faces.append(add(f"ADVANCED_FACE('',({bound}),{plane},.T.)"))
    shell = add(f"CLOSED_SHELL('',{refs(brep_faces)})")
    brep = add(f"MANIFOLD_SOLID_BREP('{name}',{shell})")
    color = add("COLOUR_RGB('',%s)" % ','.join(str(v) for v in rgb))
    fill = add(f"FILL_AREA_STYLE_COLOUR('',{color})")
    area = add(f"FILL_AREA_STYLE('',({fill}))")
    surface = add(f"SURFACE_STYLE_FILL_AREA({area})")
    side = add(f"SURFACE_SIDE_STYLE('',({surface}))")
    usage = add(f"SURFACE_STYLE_USAGE(.BOTH.,{side})")
    assignment = add(f"PRESENTATION_STYLE_ASSIGNMENT(({usage}))")
    styles.append(add(f"STYLED_ITEM('',({assignment}),{brep})"))
    return brep


def box(name, origin, size, rgb):
    x, y, z = origin
    w, d, h = size
    vertices = [(x,y,z),(x+w,y,z),(x+w,y+d,z),(x,y+d,z),(x,y,z+h),(x+w,y,z+h),(x+w,y+d,z+h),(x,y+d,z+h)]
    faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    return solid(name, vertices, faces, rgb)


styles = []
application = add("APPLICATION_CONTEXT('automotive_design')")
add(f"APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,{application})")
product_context = add(f"PRODUCT_CONTEXT('',{application},'mechanical')")
product = add(f"PRODUCT('Support Assembly','Support Assembly','Demo support bracket',({product_context}))")
formation = add(f"PRODUCT_DEFINITION_FORMATION('1','',{product})")
context = add(f"PRODUCT_DEFINITION_CONTEXT('part definition',{application},'design')")
definition = add(f"PRODUCT_DEFINITION('design','',{formation},{context})")
shape = add(f"PRODUCT_DEFINITION_SHAPE('','',{definition})")
millimeter = add("(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))")
radian = add("(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))")
steradian = add("(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())")
uncertainty = add(f"UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),{millimeter},'distance_accuracy_value','')")
geometry_context = add(f"(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT(({uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT(({millimeter},{radian},{steradian})) REPRESENTATION_CONTEXT('','3D'))")
teal = (0.40, 0.62, 0.53)
dark = (0.27, 0.38, 0.32)
solids = [
    box('Base plate', (-65,-42,0), (130,84,10), teal),
    box('Rear upright', (-51,19,10), (102,13,64), teal),
    box('Left support', (-51,-25,10), (13,44,42), teal),
    box('Right support', (38,-25,10), (13,44,42), teal),
    box('Mounting cap', (-57,14,74), (114,23,8), dark),
]
# A 32-sided shaft oriented along X is an actual faceted STEP solid, not a Three.js placeholder.
n = 32
vertices = [(x, -6 + 13*cos(i*2*pi/n), 41 + 13*sin(i*2*pi/n)) for x in (-58,58) for i in range(n)]
faces = [tuple(reversed(range(n))), tuple(range(n,2*n))]
faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
solids.append(solid('Cross shaft (faceted)', vertices, faces, (0.68,0.71,0.64)))
representation = add(f"ADVANCED_BREP_SHAPE_REPRESENTATION('Support Assembly',{refs(solids)},{geometry_context})")
add(f"SHAPE_DEFINITION_REPRESENTATION({shape},{representation})")
add(f"MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',{refs(styles)},{geometry_context})")
header = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STEP Studio generated faceted support assembly'),'2;1');
FILE_NAME('support-assembly.step','2026-11-16T00:00:00',('STEP Studio'),('STEP Studio'),'STEP Studio fixture generator','STEP Studio','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
"""
target = Path(__file__).resolve().parent.parent / 'public/samples/support-assembly.step'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(header + '\n'.join(f'#{i}={value};' for i, value in enumerate(entities, 1)) + '\nENDSEC;\nEND-ISO-10303-21;\n')
print(f'Generated {target.name} with {len(solids)} solids / {len(entities)} entities.')
